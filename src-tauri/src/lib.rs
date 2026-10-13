mod auth;
mod db;
mod google;
mod invoice;
mod models;

use chrono::{NaiveDate, SecondsFormat, Utc};
use db::Db;
use models::*;
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

struct CachedToken {
    token: String,
    expires_at: chrono::DateTime<Utc>,
}

/// Credenciales OAuth por defecto, inyectadas en tiempo de compilación con las
/// variables de entorno `FACTURITA_CLIENT_ID` / `FACTURITA_CLIENT_SECRET`.
/// Si no se definen, la app pide configurarlas manualmente.
fn default_client_id() -> Option<&'static str> {
    option_env!("FACTURITA_CLIENT_ID").filter(|value| !value.trim().is_empty())
}

fn default_client_secret() -> Option<&'static str> {
    option_env!("FACTURITA_CLIENT_SECRET").filter(|value| !value.trim().is_empty())
}

struct AppState {
    db: Db,
    http: reqwest::Client,
    token: Mutex<Option<CachedToken>>,
}

impl AppState {
    fn credentials(&self) -> Result<(String, String), String> {
        let conn = self.db.0.lock().map_err(|e| e.to_string())?;
        let stored_id = db::get_setting(&conn, "client_id");
        let stored_secret = db::get_setting(&conn, "client_secret");
        if let (Some(client_id), Some(client_secret)) = (stored_id, stored_secret) {
            return Ok((client_id, client_secret));
        }
        match (default_client_id(), default_client_secret()) {
            (Some(client_id), Some(client_secret)) => {
                Ok((client_id.to_string(), client_secret.to_string()))
            }
            _ => Err(
                "Faltan las credenciales de Google. Configúralas en la app o compila con \
                 FACTURITA_CLIENT_ID y FACTURITA_CLIENT_SECRET."
                    .to_string(),
            ),
        }
    }

    async fn access_token(&self) -> Result<String, String> {
        {
            let guard = self.token.lock().map_err(|e| e.to_string())?;
            if let Some(cached) = guard.as_ref() {
                if cached.expires_at > Utc::now() + chrono::Duration::seconds(60) {
                    return Ok(cached.token.clone());
                }
            }
        }

        let (client_id, client_secret) = self.credentials()?;
        let refresh_token = auth::load_refresh_token()?;
        let (token, expires_in) =
            auth::refresh_access_token(&self.http, &client_id, &client_secret, &refresh_token)
                .await?;
        let expires_at = Utc::now() + chrono::Duration::seconds(expires_in - 30);
        {
            let mut guard = self.token.lock().map_err(|e| e.to_string())?;
            *guard = Some(CachedToken {
                token: token.clone(),
                expires_at,
            });
        }
        Ok(token)
    }
}

fn parse_day(value: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| format!("Fecha inválida: {}", value))
}

fn day_start(date: NaiveDate) -> String {
    format!("{}T00:00:00Z", date.format("%Y-%m-%d"))
}

fn range(from: &str, to: &str) -> Result<(String, String), String> {
    let from_date = parse_day(from)?;
    let to_date = parse_day(to)?;
    let end = to_date.succ_opt().unwrap_or(to_date);
    Ok((day_start(from_date), day_start(end)))
}

fn csv_escape(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn rates_settings(conn: &Connection) -> RatesConfig {
    RatesConfig {
        default_rate: db::get_setting(conn, "default_rate")
            .and_then(|value| value.parse::<f64>().ok())
            .unwrap_or(0.0),
        shared_rate: db::get_setting(conn, "shared_rate")
            .and_then(|value| value.parse::<f64>().ok())
            .unwrap_or(0.0),
        currency: db::get_setting(conn, "currency").unwrap_or_else(|| "€".to_string()),
    }
}

#[tauri::command]
fn get_status(state: State<'_, AppState>) -> Result<AppStatus, String> {
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    let selected_calendars = db::get_setting(&conn, "selected_calendars")
        .map(|value| {
            value
                .lines()
                .filter(|line| !line.is_empty())
                .map(String::from)
                .collect()
        })
        .unwrap_or_default();
    Ok(AppStatus {
        has_credentials: db::get_setting(&conn, "client_id").is_some()
            || default_client_id().is_some(),
        connected: auth::load_refresh_token().is_ok(),
        email: db::get_setting(&conn, "email"),
        last_sync: db::get_setting(&conn, "last_sync"),
        selected_calendars,
    })
}

#[tauri::command]
fn get_google_credentials(state: State<'_, AppState>) -> Result<GoogleCredentials, String> {
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    Ok(GoogleCredentials {
        client_id: db::get_setting(&conn, "client_id")
            .or_else(|| default_client_id().map(String::from)),
        has_secret: db::get_setting(&conn, "client_secret").is_some()
            || default_client_secret().is_some(),
    })
}

#[tauri::command]
fn set_google_credentials(
    state: State<'_, AppState>,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    db::set_setting(&conn, "client_id", client_id.trim()).map_err(|e| e.to_string())?;
    db::set_setting(&conn, "client_secret", client_secret.trim()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn connect_google(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let (client_id, client_secret) = state.credentials()?;

    let (port, rx) = auth::start_loopback_server()?;
    let redirect_uri = format!("http://127.0.0.1:{}", port);
    eprintln!("[oauth] servidor loopback en el puerto {}", port);
    eprintln!("[oauth] redirect_uri = {}", redirect_uri);
    let verifier = auth::code_verifier();
    let challenge = auth::code_challenge(&verifier);
    let state_param = auth::random_state();
    let auth_url = auth::build_auth_url(&client_id, &redirect_uri, &challenge, &state_param);

    app.opener()
        .open_url(auth_url, None::<&str>)
        .map_err(|e| e.to_string())?;

    let callback = tauri::async_runtime::spawn_blocking(move || {
        rx.recv_timeout(std::time::Duration::from_secs(300))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|_| "No se recibió la autorización (tiempo agotado).".to_string())?;

    eprintln!("[oauth] URL de retorno: {}", callback);

    let parsed = url::Url::parse(&callback).map_err(|e| e.to_string())?;
    let mut code = None;
    let mut returned_state = None;
    let mut error = None;
    for (key, value) in parsed.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.into_owned()),
            "state" => returned_state = Some(value.into_owned()),
            "error" => error = Some(value.into_owned()),
            _ => {}
        }
    }

    if let Some(error) = error {
        eprintln!("[oauth] Google devolvió error: {}", error);
        return Err(format!("Google devolvió un error: {}", error));
    }
    if returned_state.as_deref() != Some(state_param.as_str()) {
        return Err("El parámetro 'state' no coincide (posible CSRF).".to_string());
    }
    let code = code.ok_or("No se recibió el código de autorización.")?;

    eprintln!("[oauth] código recibido, intercambiando por tokens...");
    let (access_token, refresh_token, expires_in) = auth::exchange_code(
        &state.http,
        &client_id,
        &client_secret,
        &code,
        &redirect_uri,
        &verifier,
    )
    .await
    .map_err(|e| {
        eprintln!("[oauth] fallo al intercambiar el código: {}", e);
        e
    })?;

    auth::save_refresh_token(&refresh_token)?;
    eprintln!("[oauth] tokens guardados correctamente");
    {
        let mut guard = state.token.lock().map_err(|e| e.to_string())?;
        *guard = Some(CachedToken {
            token: access_token.clone(),
            expires_at: Utc::now() + chrono::Duration::seconds(expires_in - 30),
        });
    }

    let email = google::user_email(&state.http, &access_token).await?;
    {
        let conn = state.db.0.lock().map_err(|e| e.to_string())?;
        db::set_setting(&conn, "email", &email).map_err(|e| e.to_string())?;
    }

    Ok(email)
}

#[tauri::command]
fn disconnect_google(state: State<'_, AppState>) -> Result<(), String> {
    let _ = auth::delete_refresh_token();
    if let Ok(mut guard) = state.token.lock() {
        *guard = None;
    }
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    let _ = db::delete_setting(&conn, "email");
    Ok(())
}

#[tauri::command]
async fn list_calendars(state: State<'_, AppState>) -> Result<Vec<CalendarEntry>, String> {
    let token = state.access_token().await?;
    let mut calendars = google::list_calendars(&state.http, &token).await?;
    let selected: Vec<String> = {
        let conn = state.db.0.lock().map_err(|e| e.to_string())?;
        db::get_setting(&conn, "selected_calendars")
            .map(|value| value.lines().map(String::from).collect())
            .unwrap_or_default()
    };
    let use_primary = selected.is_empty();
    for calendar in &mut calendars {
        calendar.selected = if use_primary {
            calendar.primary
        } else {
            selected.iter().any(|id| id == &calendar.id)
        };
    }
    Ok(calendars)
}

#[tauri::command]
fn set_selected_calendars(state: State<'_, AppState>, ids: Vec<String>) -> Result<(), String> {
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    db::set_setting(&conn, "selected_calendars", &ids.join("\n")).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn sync_events(
    state: State<'_, AppState>,
    calendar_ids: Vec<String>,
    from: String,
    to: String,
) -> Result<SyncSummary, String> {
    let token = state.access_token().await?;
    let teacher = {
        let conn = state.db.0.lock().map_err(|e| e.to_string())?;
        db::get_setting(&conn, "email")
    };
    let teacher = match teacher {
        Some(email) => email,
        None => {
            let email = google::user_email(&state.http, &token).await?;
            let conn = state.db.0.lock().map_err(|e| e.to_string())?;
            db::set_setting(&conn, "email", &email).map_err(|e| e.to_string())?;
            email
        }
    };

    let (time_min, time_max) = range(&from, &to)?;
    let calendars = if calendar_ids.is_empty() {
        vec!["primary".to_string()]
    } else {
        calendar_ids
    };

    let mut fetched = 0usize;
    let mut classes = 0usize;

    for calendar in &calendars {
        let events =
            google::list_events(&state.http, &token, calendar, &time_min, &time_max).await?;
        fetched += events.len();

        let mut conn = state.db.0.lock().map_err(|e| e.to_string())?;
        for mut event in events {
            if event.status.eq_ignore_ascii_case("cancelled") {
                continue;
            }
            event.clients.retain(|client| {
                !client.email.eq_ignore_ascii_case(&teacher)
                    && !client
                        .rsvp
                        .as_deref()
                        .map(|rsvp| rsvp.eq_ignore_ascii_case("declined"))
                        .unwrap_or(false)
            });
            if event.clients.is_empty() {
                continue;
            }
            db::upsert_event(&mut conn, &event).map_err(|e| e.to_string())?;
            classes += 1;
        }
    }

    let last_sync = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
    {
        let conn = state.db.0.lock().map_err(|e| e.to_string())?;
        db::set_setting(&conn, "last_sync", &last_sync).map_err(|e| e.to_string())?;
    }

    Ok(SyncSummary {
        fetched,
        classes,
        calendars: calendars.len(),
        last_sync,
    })
}

#[tauri::command]
fn monthly_stats(
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> Result<Vec<MonthlyStat>, String> {
    let (from_ts, to_ts) = range(&from, &to)?;
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    db::monthly_stats(&conn, &from_ts, &to_ts).map_err(|e| e.to_string())
}

#[tauri::command]
fn client_stats(
    state: State<'_, AppState>,
    from: String,
    to: String,
    month: Option<String>,
) -> Result<Vec<ClientStat>, String> {
    let (from_ts, to_ts) = range(&from, &to)?;
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    db::client_stats(&conn, &from_ts, &to_ts, month.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn class_detail(
    state: State<'_, AppState>,
    from: String,
    to: String,
    email: Option<String>,
) -> Result<Vec<ClassDetail>, String> {
    let (from_ts, to_ts) = range(&from, &to)?;
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    let config = rates_settings(&conn);
    db::class_detail(
        &conn,
        &from_ts,
        &to_ts,
        email.as_deref(),
        config.default_rate,
        config.shared_rate,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn export_csv(
    state: State<'_, AppState>,
    from: String,
    to: String,
    email: Option<String>,
) -> Result<String, String> {
    let (from_ts, to_ts) = range(&from, &to)?;
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    let config = rates_settings(&conn);
    let groups = db::list_classes(
        &conn,
        &from_ts,
        &to_ts,
        config.default_rate,
        config.shared_rate,
    )
    .map_err(|e| e.to_string())?;

    let mut output = String::from("Fecha,Clase,Cliente,Email,Tipo,Duracion (min),Importe\n");
    for group in groups {
        for client in &group.clients {
            if let Some(filter) = &email {
                if !client.email.eq_ignore_ascii_case(filter) {
                    continue;
                }
            }
            output.push_str(&format!(
                "{},{},{},{},{},{},{:.2}\n",
                csv_escape(&group.start_ts),
                csv_escape(group.summary.as_deref().unwrap_or("")),
                csv_escape(&client.name),
                csv_escape(&client.email),
                if group.shared {
                    "Compartida"
                } else {
                    "Individual"
                },
                group
                    .duration_min
                    .map(|d| d.to_string())
                    .unwrap_or_default(),
                client.amount,
            ));
        }
    }
    Ok(output)
}

#[tauri::command]
fn get_rates_config(state: State<'_, AppState>) -> Result<RatesConfig, String> {
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    Ok(rates_settings(&conn))
}

#[tauri::command]
fn set_rates_config(
    state: State<'_, AppState>,
    default_rate: f64,
    shared_rate: f64,
    currency: String,
) -> Result<(), String> {
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    db::set_setting(&conn, "default_rate", &default_rate.to_string()).map_err(|e| e.to_string())?;
    db::set_setting(&conn, "shared_rate", &shared_rate.to_string()).map_err(|e| e.to_string())?;
    db::set_setting(&conn, "currency", currency.trim()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_client_rate(
    state: State<'_, AppState>,
    email: String,
    rate: Option<f64>,
    effective_from: Option<String>,
) -> Result<(), String> {
    let effective_from = effective_from.unwrap_or_else(|| Utc::now().format("%Y-%m").to_string());
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    db::set_client_rate(&conn, &email, rate, &effective_from).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_client_rate(
    state: State<'_, AppState>,
    email: String,
    old_effective_from: String,
    new_effective_from: String,
    rate: Option<f64>,
) -> Result<(), String> {
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    db::update_client_rate(
        &conn,
        &email,
        &old_effective_from,
        &new_effective_from,
        rate,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_client_rate(
    state: State<'_, AppState>,
    email: String,
    effective_from: String,
) -> Result<(), String> {
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    db::delete_client_rate(&conn, &email, &effective_from).map_err(|e| e.to_string())
}

#[tauri::command]
fn client_rate_history(
    state: State<'_, AppState>,
    email: String,
) -> Result<Vec<RateHistoryEntry>, String> {
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    db::list_client_rates(&conn, &email).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_events_review(
    state: State<'_, AppState>,
    ids: Vec<String>,
    review: String,
) -> Result<usize, String> {
    let mut conn = state.db.0.lock().map_err(|e| e.to_string())?;
    db::set_events_review(&mut conn, &ids, &review).map_err(|e| e.to_string())
}

#[tauri::command]
fn pending_count(state: State<'_, AppState>) -> Result<i64, String> {
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    db::pending_count(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn income_by_client(
    state: State<'_, AppState>,
    from: String,
    to: String,
    month: Option<String>,
) -> Result<Vec<ClientIncome>, String> {
    let (from_ts, to_ts) = range(&from, &to)?;
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    let config = rates_settings(&conn);
    db::income_by_client(
        &conn,
        &from_ts,
        &to_ts,
        month.as_deref(),
        config.default_rate,
        config.shared_rate,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn income_by_month(
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> Result<Vec<MonthlyIncome>, String> {
    let (from_ts, to_ts) = range(&from, &to)?;
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    let config = rates_settings(&conn);
    db::income_by_month(
        &conn,
        &from_ts,
        &to_ts,
        config.default_rate,
        config.shared_rate,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_classes(
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> Result<Vec<ClassGroup>, String> {
    let (from_ts, to_ts) = range(&from, &to)?;
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    let config = rates_settings(&conn);
    db::list_classes(
        &conn,
        &from_ts,
        &to_ts,
        config.default_rate,
        config.shared_rate,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn accept_import(state: State<'_, AppState>, from: String, to: String) -> Result<usize, String> {
    let (from_ts, to_ts) = range(&from, &to)?;
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    db::accept_import(&conn, &from_ts, &to_ts).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_event_review(state: State<'_, AppState>, id: String, review: String) -> Result<(), String> {
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    db::set_event_review(&conn, &id, &review).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_client_name(
    state: State<'_, AppState>,
    email: String,
    name: Option<String>,
) -> Result<(), String> {
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    db::set_client_name(&conn, &email, name.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_clients(state: State<'_, AppState>) -> Result<Vec<ClientEntry>, String> {
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    db::list_clients(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn latest_event_month(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    Ok(db::latest_event_month(&conn))
}

#[tauri::command]
fn get_setting_value(state: State<'_, AppState>, key: String) -> Result<Option<String>, String> {
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    Ok(db::get_setting(&conn, &key))
}

#[tauri::command]
fn set_setting_value(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    db::set_setting(&conn, &key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
async fn export_backup(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let file_name = format!("facturita-backup-{}.json", Utc::now().format("%Y%m%d"));
    let path = app
        .dialog()
        .file()
        .set_file_name(&file_name)
        .add_filter("JSON", &["json"])
        .blocking_save_file();
    let Some(path) = path else { return Ok(None) };
    let path = path.into_path().map_err(|e| e.to_string())?;

    let exported_at = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
    let json = {
        let conn = state.db.0.lock().map_err(|e| e.to_string())?;
        let backup = db::export_backup(&conn, &exported_at).map_err(|e| e.to_string())?;
        serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())?
    };
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
async fn import_backup(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<BackupSummary>, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .blocking_pick_file();
    let Some(path) = path else { return Ok(None) };
    let path = path.into_path().map_err(|e| e.to_string())?;

    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let backup: Backup =
        serde_json::from_str(&content).map_err(|e| format!("Archivo no válido: {}", e))?;

    let summary = BackupSummary {
        file: path.to_string_lossy().to_string(),
        events: backup.events.len(),
        clients: backup.event_clients.len(),
        rates: backup.client_rate_history.len(),
        names: backup.client_names.len(),
        settings: backup.settings.len(),
    };

    {
        let mut conn = state.db.0.lock().map_err(|e| e.to_string())?;
        db::import_backup(&mut conn, &backup).map_err(|e| e.to_string())?;
    }
    if let Ok(mut guard) = state.token.lock() {
        *guard = None;
    }
    Ok(Some(summary))
}

fn issuer_from_settings(conn: &Connection) -> InvoiceIssuer {
    InvoiceIssuer {
        name: db::get_setting(conn, "issuer_name").unwrap_or_default(),
        tax_id: db::get_setting(conn, "issuer_tax_id").unwrap_or_default(),
        address: db::get_setting(conn, "issuer_address").unwrap_or_default(),
        email: db::get_setting(conn, "issuer_email")
            .filter(|value| !value.trim().is_empty())
            .or_else(|| db::get_setting(conn, "email"))
            .unwrap_or_default(),
        phone: db::get_setting(conn, "issuer_phone").filter(|value| !value.trim().is_empty()),
    }
}

fn client_for(conn: &Connection, email: &str) -> InvoiceClient {
    let name = db::list_clients(conn)
        .ok()
        .and_then(|list| {
            list.into_iter()
                .find(|client| client.email.eq_ignore_ascii_case(email))
        })
        .map(|client| client.name)
        .unwrap_or_else(|| email.to_string());
    InvoiceClient {
        name,
        email: email.to_string(),
        tax_id: None,
    }
}

/// Límites UTC `[inicio del mes, inicio del mes siguiente)` para `YYYY-MM`.
fn month_bounds(month: &str) -> Result<(String, String), String> {
    let (year, month_num) = month
        .split_once('-')
        .ok_or_else(|| format!("Mes inválido: {}", month))?;
    let year: i32 = year
        .parse()
        .map_err(|_| format!("Mes inválido: {}", month))?;
    let month_num: u32 = month_num
        .parse()
        .map_err(|_| format!("Mes inválido: {}", month))?;
    if !(1..=12).contains(&month_num) {
        return Err(format!("Mes inválido: {}", month));
    }
    let start = NaiveDate::from_ymd_opt(year, month_num, 1)
        .ok_or_else(|| format!("Mes inválido: {}", month))?;
    let end = if month_num == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(year, month_num + 1, 1)
    }
    .ok_or_else(|| format!("Mes inválido: {}", month))?;
    Ok((day_start(start), day_start(end)))
}

fn build_invoice_lines(detail: Vec<ClassDetail>) -> (Vec<InvoiceLine>, f64) {
    let mut total = 0.0;
    let lines = detail
        .into_iter()
        .map(|row| {
            total += row.amount;
            InvoiceLine {
                date: row.start_ts,
                concept: row.summary.unwrap_or_default(),
                duration_min: row.duration_min,
                rate: row.rate,
                amount: row.amount,
            }
        })
        .collect();
    (lines, total)
}

fn current_series() -> String {
    Utc::now().format("%Y").to_string()
}

fn slugify(value: &str) -> String {
    let mut out = String::new();
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if (ch == ' ' || ch == '-' || ch == '_') && !out.ends_with('-') {
            out.push('-');
        }
    }
    let trimmed = out.trim_matches('-');
    if trimmed.is_empty() {
        "cliente".to_string()
    } else {
        trimmed.chars().take(40).collect()
    }
}

fn invoice_file_name(number: &str, client: &str) -> String {
    format!("Factura-{}-{}.pdf", number, slugify(client))
}

#[tauri::command]
fn get_invoice_settings(state: State<'_, AppState>) -> Result<InvoiceSettings, String> {
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    let issuer = issuer_from_settings(&conn);
    Ok(InvoiceSettings {
        name: issuer.name,
        tax_id: issuer.tax_id,
        address: issuer.address,
        email: issuer.email,
        phone: issuer.phone.unwrap_or_default(),
    })
}

#[tauri::command]
fn set_invoice_settings(
    state: State<'_, AppState>,
    name: String,
    tax_id: String,
    address: String,
    email: String,
    phone: String,
) -> Result<(), String> {
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    db::set_setting(&conn, "issuer_name", name.trim()).map_err(|e| e.to_string())?;
    db::set_setting(&conn, "issuer_tax_id", tax_id.trim()).map_err(|e| e.to_string())?;
    db::set_setting(&conn, "issuer_address", address.trim()).map_err(|e| e.to_string())?;
    db::set_setting(&conn, "issuer_email", email.trim()).map_err(|e| e.to_string())?;
    db::set_setting(&conn, "issuer_phone", phone.trim()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn preview_invoice(
    state: State<'_, AppState>,
    email: String,
    month: String,
) -> Result<InvoicePreview, String> {
    let (from_ts, to_ts) = month_bounds(&month)?;
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    let config = rates_settings(&conn);
    let detail = db::class_detail(
        &conn,
        &from_ts,
        &to_ts,
        Some(&email),
        config.default_rate,
        config.shared_rate,
    )
    .map_err(|e| e.to_string())?;
    let (lines, total) = build_invoice_lines(detail);
    let series = current_series();
    let number = format!(
        "{}-{:04}",
        series,
        db::next_invoice_number(&conn, &series).map_err(|e| e.to_string())?
    );
    Ok(InvoicePreview {
        number,
        period: month,
        currency: config.currency,
        client: client_for(&conn, &email),
        lines,
        total,
    })
}

#[tauri::command]
async fn issue_invoice(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    email: String,
    month: String,
    client_tax_id: Option<String>,
) -> Result<Option<InvoiceIssued>, String> {
    let data = {
        let conn = state.db.0.lock().map_err(|e| e.to_string())?;
        let issuer = issuer_from_settings(&conn);
        if issuer.name.trim().is_empty() || issuer.tax_id.trim().is_empty() {
            return Err("Faltan los datos de facturación (nombre y NIF del emisor).".to_string());
        }
        let (from_ts, to_ts) = month_bounds(&month)?;
        let config = rates_settings(&conn);
        let detail = db::class_detail(
            &conn,
            &from_ts,
            &to_ts,
            Some(&email),
            config.default_rate,
            config.shared_rate,
        )
        .map_err(|e| e.to_string())?;
        let (lines, total) = build_invoice_lines(detail);
        if lines.is_empty() {
            return Err("No hay clases en el mes seleccionado.".to_string());
        }
        let series = current_series();
        let number = db::next_invoice_number(&conn, &series).map_err(|e| e.to_string())?;
        let mut client = client_for(&conn, &email);
        client.tax_id = client_tax_id.filter(|value| !value.trim().is_empty());
        InvoiceData {
            number: format!("{}-{:04}", series, number),
            issued_on: Utc::now().format("%Y-%m-%d").to_string(),
            period: month,
            currency: config.currency,
            issuer,
            client,
            lines,
            total,
        }
    };

    let file_name = invoice_file_name(&data.number, &data.client.name);
    let path = app
        .dialog()
        .file()
        .set_file_name(&file_name)
        .add_filter("PDF", &["pdf"])
        .blocking_save_file();
    let Some(path) = path else { return Ok(None) };
    let path = path.into_path().map_err(|e| e.to_string())?;

    let bytes = invoice::render(&data)?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;

    let created_ts = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
    let id = {
        let conn = state.db.0.lock().map_err(|e| e.to_string())?;
        let series = data.number.split('-').next().unwrap_or("").to_string();
        let number: i64 = data
            .number
            .split('-')
            .nth(1)
            .and_then(|value| value.parse().ok())
            .ok_or("Número de factura inválido.")?;
        db::insert_invoice(&conn, &series, number, &created_ts, &data).map_err(|e| e.to_string())?
    };

    Ok(Some(InvoiceIssued {
        id,
        number: data.number,
        file: path.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
fn list_invoices(state: State<'_, AppState>) -> Result<Vec<InvoiceRecord>, String> {
    let conn = state.db.0.lock().map_err(|e| e.to_string())?;
    db::list_invoices(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
async fn export_saved_invoice(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: i64,
) -> Result<Option<String>, String> {
    let data = {
        let conn = state.db.0.lock().map_err(|e| e.to_string())?;
        db::get_invoice_data(&conn, id)
            .map_err(|e| e.to_string())?
            .ok_or("Factura no encontrada.")?
    };
    let file_name = invoice_file_name(&data.number, &data.client.name);
    let path = app
        .dialog()
        .file()
        .set_file_name(&file_name)
        .add_filter("PDF", &["pdf"])
        .blocking_save_file();
    let Some(path) = path else { return Ok(None) };
    let path = path.into_path().map_err(|e| e.to_string())?;
    let bytes = invoice::render(&data)?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let conn = db::init(&dir.join("facturita.db")).map_err(|e| e.to_string())?;
            let http = reqwest::Client::builder()
                .user_agent(concat!("facturita/", env!("CARGO_PKG_VERSION")))
                .build()
                .map_err(|e| e.to_string())?;
            app.manage(AppState {
                db: Db(Mutex::new(conn)),
                http,
                token: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            get_google_credentials,
            set_google_credentials,
            connect_google,
            disconnect_google,
            list_calendars,
            set_selected_calendars,
            sync_events,
            monthly_stats,
            client_stats,
            class_detail,
            export_csv,
            get_rates_config,
            set_rates_config,
            set_client_rate,
            update_client_rate,
            delete_client_rate,
            client_rate_history,
            income_by_client,
            income_by_month,
            list_classes,
            accept_import,
            set_event_review,
            set_events_review,
            pending_count,
            set_client_name,
            list_clients,
            latest_event_month,
            get_setting_value,
            set_setting_value,
            export_backup,
            import_backup,
            get_invoice_settings,
            set_invoice_settings,
            preview_invoice,
            issue_invoice,
            list_invoices,
            export_saved_invoice,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_day_accepts_iso_and_rejects_garbage() {
        assert!(parse_day("2024-02-29").is_ok());
        assert!(parse_day("2024-13-01").is_err());
        assert!(parse_day("29/02/2024").is_err());
    }

    #[test]
    fn range_makes_to_inclusive() {
        let (from, to) = range("2024-02-05", "2024-02-10").unwrap();
        assert_eq!(from, "2024-02-05T00:00:00Z");
        assert_eq!(to, "2024-02-11T00:00:00Z");
    }

    #[test]
    fn csv_escape_quotes_only_when_needed() {
        assert_eq!(csv_escape("Clase de inglés"), "Clase de inglés");
        assert_eq!(csv_escape("Ana, Luis"), "\"Ana, Luis\"");
        assert_eq!(csv_escape("di \"hola\""), "\"di \"\"hola\"\"\"");
        assert_eq!(csv_escape("linea\nnueva"), "\"linea\nnueva\"");
    }

    #[test]
    fn rates_settings_reads_defaults_and_stored_values() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)")
            .unwrap();

        let defaults = rates_settings(&conn);
        assert_eq!(defaults.default_rate, 0.0);
        assert_eq!(defaults.shared_rate, 0.0);
        assert_eq!(defaults.currency, "€");

        db::set_setting(&conn, "default_rate", "25").unwrap();
        db::set_setting(&conn, "shared_rate", "12.5").unwrap();
        db::set_setting(&conn, "currency", "$").unwrap();

        let configured = rates_settings(&conn);
        assert_eq!(configured.default_rate, 25.0);
        assert_eq!(configured.shared_rate, 12.5);
        assert_eq!(configured.currency, "$");
    }

    fn sample_invoice() -> InvoiceData {
        InvoiceData {
            number: "2026-0001".to_string(),
            issued_on: "2026-02-01".to_string(),
            period: "2026-01".to_string(),
            currency: "€".to_string(),
            issuer: InvoiceIssuer {
                name: "Ana Pérez".to_string(),
                tax_id: "12345678A".to_string(),
                address: "Calle Mayor 1, 28001 Madrid".to_string(),
                email: "ana@example.com".to_string(),
                phone: Some("600 000 000".to_string()),
            },
            client: InvoiceClient {
                name: "Bruno García".to_string(),
                email: "bruno@example.com".to_string(),
                tax_id: None,
            },
            lines: vec![InvoiceLine {
                date: "2026-01-05T10:00:00Z".to_string(),
                concept: "Clase de inglés".to_string(),
                duration_min: Some(60),
                rate: 30.0,
                amount: 30.0,
            }],
            total: 30.0,
        }
    }

    #[test]
    fn month_bounds_cover_the_full_month() {
        let (from, to) = month_bounds("2024-02").unwrap();
        assert_eq!(from, "2024-02-01T00:00:00Z");
        assert_eq!(to, "2024-03-01T00:00:00Z");

        let (from, to) = month_bounds("2024-12").unwrap();
        assert_eq!(from, "2024-12-01T00:00:00Z");
        assert_eq!(to, "2025-01-01T00:00:00Z");

        assert!(month_bounds("2024-13").is_err());
        assert!(month_bounds("nope").is_err());
    }

    #[test]
    fn slugify_makes_safe_file_names() {
        assert_eq!(slugify("Bruno Garcia"), "bruno-garcia");
        assert_eq!(slugify("///"), "cliente");
        assert_eq!(
            invoice_file_name("2026-0007", "Bruno Garcia"),
            "Factura-2026-0007-bruno-garcia.pdf"
        );
    }

    #[test]
    fn render_produces_a_pdf() {
        let bytes = invoice::render(&sample_invoice()).unwrap();
        assert!(bytes.starts_with(b"%PDF"));
        assert!(bytes.len() > 1000);
    }
}

//! Datos de ejemplo para desarrollar sin depender de la cuenta de Google.
//!
//! Se activa con `FACTURITA_DEMO=1 npm run dev:demo`. Usa una base de datos
//! aparte (`facturita-demo.db`), así que no toca la instalación real, y la
//! rellena la primera vez: 14 meses de clases, varios clientes, una empresa
//! con emails vinculados, clases pendientes/canceladas/obsoletas, tarifas
//! manuales y cuatro facturas ya emitidas. Para empezar de cero basta con
//! borrar ese fichero (la ruta se imprime al arrancar la app).

use crate::db;
use crate::models::{
    CalendarEntry, ClassDetail, ClientBilling, InvoiceClient, InvoiceData, InvoiceIssuer,
};
use chrono::{Datelike, Duration, NaiveDate, SecondsFormat, Utc};
use rusqlite::{params, Connection};

const DEFAULT_RATE: f64 = 20.0;
const SHARED_RATE: f64 = 12.0;
const CURRENCY: &str = "€";
/// Meses de histórico que se generan (incluido el mes en curso).
const MONTHS: i64 = 14;
const CALENDAR: &str = "demo-clases";
/// Email del cliente manual «empresa» al que se vinculan varios alumnos.
const ACME: &str = "facturas@acme.example";
const ANA: &str = "ana.garcia@example.com";

/// `true` si se ha arrancado con `FACTURITA_DEMO=1` (solo en builds de desarrollo).
pub fn enabled() -> bool {
    cfg!(debug_assertions)
        && std::env::var("FACTURITA_DEMO")
            .map(|value| !value.is_empty() && value != "0")
            .unwrap_or(false)
}

/// Calendarios simulados (no se llama a Google en modo demo).
pub fn calendars() -> Vec<CalendarEntry> {
    vec![
        CalendarEntry {
            id: CALENDAR.to_string(),
            summary: "Clases (demo)".to_string(),
            primary: true,
            selected: true,
            access_role: Some("owner".to_string()),
        },
        CalendarEntry {
            id: "demo-secundaria".to_string(),
            summary: "Clases puntuales (demo)".to_string(),
            primary: false,
            selected: false,
            access_role: Some("reader".to_string()),
        },
    ]
}

struct DemoClient {
    /// Etiqueta corta que forma parte del id de cada evento.
    label: &'static str,
    email: &'static str,
    name: &'static str,
    /// Días del mes en los que tiene clase.
    days: &'static [u32],
    hour: u32,
    minute: u32,
    duration: i64,
    /// Tarifa por clase (además de la normal y la compartida).
    rate: Option<f64>,
    /// La tarifa sube a mitad del periodo (para ver el histórico de tarifas).
    raise: Option<f64>,
}

const CLIENTS: &[DemoClient] = &[
    DemoClient {
        label: "ana",
        email: ANA,
        name: "Ana García",
        days: &[3, 17],
        hour: 17,
        minute: 0,
        duration: 60,
        rate: Some(25.0),
        raise: Some(30.0),
    },
    DemoClient {
        label: "bruno",
        email: "bruno.lopez@example.com",
        name: "Bruno López",
        days: &[4],
        hour: 18,
        minute: 0,
        duration: 60,
        rate: Some(22.0),
        raise: None,
    },
    DemoClient {
        label: "carla",
        email: "carla.ruiz@example.com",
        name: "Carla Ruiz",
        days: &[5],
        hour: 19,
        minute: 0,
        duration: 60,
        rate: None,
        raise: None,
    },
    DemoClient {
        label: "diego",
        email: "diego.moreno@example.com",
        name: "Diego Moreno",
        days: &[10],
        hour: 16,
        minute: 0,
        duration: 90,
        rate: Some(28.0),
        raise: None,
    },
    DemoClient {
        label: "elena",
        email: "elena.vidal@example.com",
        name: "Elena Vidal",
        days: &[11],
        hour: 17,
        minute: 30,
        duration: 60,
        rate: None,
        raise: None,
    },
    DemoClient {
        label: "fran",
        email: "fran.ortega@example.com",
        name: "Fran Ortega",
        days: &[12],
        hour: 18,
        minute: 0,
        duration: 60,
        rate: None,
        raise: None,
    },
];

/// Alumnos de la clase compartida (cada uno paga la tarifa compartida).
const SHARED_STUDENTS: &[(&str, &str)] = &[
    ("lucia.sanz@example.com", "Lucía Sanz"),
    ("pablo.nieto@example.com", "Pablo Nieto"),
];
const SHARED_DAYS: &[u32] = &[7, 21];

struct EventSeed {
    id: String,
    start_local: String,
    duration: i64,
    status: &'static str,
    accepted: i64,
    discarded: i64,
    stale: i64,
    include_cancelled: i64,
    clients: Vec<(&'static str, &'static str, i64, Option<f64>)>,
}

/// Rellena la base de datos de demo si está vacía.
pub fn seed(conn: &Connection) -> rusqlite::Result<()> {
    if !is_empty(conn)? {
        return Ok(());
    }
    let today = Utc::now().date_naive();
    let first_month = month_offset(today, -(MONTHS - 1));

    seed_settings(conn)?;
    seed_clients(conn, first_month)?;

    let events = build_events(today);
    insert_events(conn, &events)?;

    seed_manual_clients(conn)?;
    seed_invoices(conn, today)?;
    Ok(())
}

fn is_empty(conn: &Connection) -> rusqlite::Result<bool> {
    let events: i64 = conn.query_row("SELECT COUNT(*) FROM events", [], |row| row.get(0))?;
    let manual: i64 =
        conn.query_row("SELECT COUNT(*) FROM manual_clients", [], |row| row.get(0))?;
    Ok(events == 0 && manual == 0)
}

fn seed_settings(conn: &Connection) -> rusqlite::Result<()> {
    db::set_setting(conn, "default_rate", &DEFAULT_RATE.to_string())?;
    db::set_setting(conn, "shared_rate", &SHARED_RATE.to_string())?;
    db::set_setting(conn, "currency", CURRENCY)?;
    // Sin auto-sync: en modo demo no hay Google y el arranque no debe fallar.
    db::set_setting(conn, "auto_sync", "0")?;
    db::set_setting(conn, "issuer_name", "Academia Demo")?;
    db::set_setting(conn, "issuer_tax_id", "12345678Z")?;
    db::set_setting(conn, "issuer_address", "Calle de la Demo 1, 28001 Madrid")?;
    db::set_setting(conn, "issuer_email", "hola@academia-demo.example")?;
    db::set_setting(conn, "issuer_phone", "600 123 456")?;
    db::set_setting(conn, "issuer_bank_account", "ES91 2100 0418 4502 0005 1332")?;
    db::set_setting(
        conn,
        "last_sync",
        &Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
    )?;
    Ok(())
}

fn seed_clients(conn: &Connection, first_month: NaiveDate) -> rusqlite::Result<()> {
    for client in CLIENTS {
        db::set_client_name(conn, client.email, Some(client.name))?;
        if let Some(rate) = client.rate {
            db::set_client_rate(conn, client.email, Some(rate), &month_key(first_month))?;
        }
        if let Some(raised) = client.raise {
            let from = month_key(month_offset(first_month, MONTHS / 2));
            db::set_client_rate(conn, client.email, Some(raised), &from)?;
        }
    }

    // Datos fiscales para que las facturas de ejemplo salgan completas.
    db::set_client_billing(
        conn,
        ANA,
        &ClientBilling {
            legal_name: "Ana García Ruiz".to_string(),
            tax_id: "87654321B".to_string(),
            address: "Calle Mayor 1, 28001 Madrid".to_string(),
            language: "es".to_string(),
        },
    )?;
    Ok(())
}

fn build_events(today: NaiveDate) -> Vec<EventSeed> {
    let current = month_key(today);
    let previous = month_key(month_offset(today, -1));
    let mut events = Vec::new();

    for offset in 0..MONTHS {
        let month = month_offset(today, -(MONTHS - 1 - offset));
        let key = month_key(month);

        for client in CLIENTS {
            for day in client.days {
                let mut event = EventSeed {
                    id: event_id(&key, client.label, *day),
                    start_local: start_local(month, *day, client.hour, client.minute),
                    duration: client.duration,
                    status: "confirmed",
                    accepted: 1,
                    discarded: 0,
                    stale: 0,
                    include_cancelled: 0,
                    clients: vec![(client.email, client.name, 1, None)],
                };

                // Variaciones para poder revisar la Importación y las canceladas.
                if key == current {
                    match (client.label, day) {
                        // Pendientes de aceptar en el mes en curso.
                        ("ana", 17) | ("bruno", 4) => event.accepted = 0,
                        // Descartada a mano.
                        ("carla", _) => event.discarded = 1,
                        // Tarifa/hora especial solo en esta clase (90 min).
                        ("diego", _) => event.clients[0].3 = Some(35.0),
                        // Invitada extra que no cuenta para la clase.
                        ("ana", 3) => event.clients.push((
                            "padre.de.ana@example.com",
                            "Padre de Ana",
                            0,
                            None,
                        )),
                        _ => {}
                    }
                }
                if key == previous {
                    match client.label {
                        // Cancelada en Google: se importa pero no cuenta.
                        "diego" => {
                            event.status = "cancelled";
                            event.include_cancelled = 0;
                        }
                        // Ya no aparece en Google: fuera del cómputo.
                        "elena" => event.stale = 1,
                        _ => {}
                    }
                }
                events.push(event);
            }
        }

        // Clase compartida: cada alumno paga la tarifa compartida.
        for day in SHARED_DAYS {
            events.push(EventSeed {
                id: event_id(&key, "shared", *day),
                start_local: start_local(month, *day, 11, 0),
                duration: 60,
                status: "confirmed",
                accepted: 1,
                discarded: 0,
                stale: 0,
                include_cancelled: 0,
                clients: SHARED_STUDENTS
                    .iter()
                    .map(|(email, name)| (*email, *name, 1, None))
                    .collect(),
            });
        }
    }
    events
}

fn insert_events(conn: &Connection, events: &[EventSeed]) -> rusqlite::Result<()> {
    let titles = [
        "Clase de inglés",
        "Clase de conversación",
        "Repaso de gramática",
    ];
    for (index, event) in events.iter().enumerate() {
        let summary = titles[index % titles.len()];
        let end = end_local(&event.start_local, event.duration);
        let start_ts = format!("{}Z", event.start_local);
        let end_ts = format!("{}Z", end);
        conn.execute(
            "INSERT INTO events (id, calendar_id, summary, start_ts, start_local, end_ts, status,
                                 duration_min, updated_ts, accepted, discarded, stale,
                                 include_cancelled)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                event.id,
                CALENDAR,
                summary,
                start_ts,
                event.start_local,
                end_ts,
                event.status,
                event.duration,
                start_ts,
                event.accepted,
                event.discarded,
                event.stale,
                event.include_cancelled,
            ],
        )?;
        for (email, name, billable, override_rate) in &event.clients {
            conn.execute(
                "INSERT INTO event_clients (event_id, email, name, rsvp, billable, override_rate)
                 VALUES (?1, ?2, ?3, 'accepted', ?4, ?5)",
                params![event.id, email, name, billable, override_rate],
            )?;
        }
    }
    Ok(())
}

fn seed_manual_clients(conn: &Connection) -> rusqlite::Result<()> {
    let created_ts = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
    // Empresa (cliente manual con email propio) a la que se vinculan dos alumnos.
    db::create_manual_client(conn, "Acme S.L.", Some(ACME), &created_ts)?;
    for (email, _) in SHARED_STUDENTS {
        db::link_client_alias(conn, email, ACME)?;
    }
    db::set_client_billing(
        conn,
        ACME,
        &ClientBilling {
            legal_name: "Acme S.L.".to_string(),
            tax_id: "B12345678".to_string(),
            address: "Calle Industria 12, 28021 Madrid".to_string(),
            // Empresa extranjera: sus facturas salen en inglés.
            language: "en".to_string(),
        },
    )?;
    // Cliente manual sin email ni clases: para ver cómo queda en la lista.
    db::create_manual_client(conn, "Grupo Los Olivos", None, &created_ts)?;
    Ok(())
}

/// (cliente, etiqueta de la clase, mes, días que entran en la factura)
const INVOICES: &[(&str, &str, i64, &[u32])] = &[
    // Ana: dos meses atrás se factura el mes completo.
    (ANA, "ana", -2, &[3, 17]),
    // Ana: el mes pasado queda una clase sin facturar.
    (ANA, "ana", -1, &[3]),
    // Acme: su clase compartida del mes pasado, y una del mes en curso
    // (la otra se queda sin facturar para ver el bloqueo en el diálogo).
    (ACME, "shared", -1, &[7]),
    (ACME, "shared", 0, &[7]),
];

fn seed_invoices(conn: &Connection, today: NaiveDate) -> rusqlite::Result<()> {
    for &(email, label, offset, days) in INVOICES {
        let month = month_offset(today, offset);
        let key = month_key(month);
        let wanted: Vec<String> = days.iter().map(|day| event_id(&key, label, *day)).collect();
        let (from, to) = month_bounds(&key)?;
        let detail = db::class_detail(conn, &from, &to, Some(email), DEFAULT_RATE, SHARED_RATE)?;
        let selected: Vec<ClassDetail> = detail
            .into_iter()
            .filter(|row| wanted.contains(&row.id))
            .collect();
        if selected.is_empty() {
            continue;
        }
        let event_ids: Vec<String> = selected.iter().map(|row| row.id.clone()).collect();
        let (lines, total) = crate::build_invoice_lines(selected);

        // Se emite el día 1 del mes siguiente al periodo.
        let issued_on = month_offset(month, 1).format("%Y-%m-%d").to_string();
        let series = issued_on[0..4].to_string();
        let number = db::next_invoice_number(conn, &series)?;
        let lang = db::get_client_billing(conn, email)
            .map(|billing| billing.language)
            .unwrap_or_else(|_| "es".to_string());
        let data = InvoiceData {
            number: format!("{}-{:04}", series, number),
            issued_on: issued_on.clone(),
            period: key,
            currency: CURRENCY.to_string(),
            issuer: demo_issuer(),
            client: invoice_client_for(conn, email)?,
            lines,
            total,
            lang,
        };
        db::insert_invoice(
            conn,
            &series,
            number,
            &format!("{}T10:00:00Z", issued_on),
            &data,
            &event_ids,
        )?;
    }
    Ok(())
}

fn demo_issuer() -> InvoiceIssuer {
    InvoiceIssuer {
        name: "Academia Demo".to_string(),
        tax_id: "12345678Z".to_string(),
        address: "Calle de la Demo 1, 28001 Madrid".to_string(),
        email: "hola@academia-demo.example".to_string(),
        phone: Some("600 123 456".to_string()),
        bank_account: Some("ES91 2100 0418 4502 0005 1332".to_string()),
    }
}

fn invoice_client_for(conn: &Connection, email: &str) -> rusqlite::Result<InvoiceClient> {
    let billing = db::get_client_billing(conn, email).unwrap_or_default();
    let name = db::list_clients(conn)?
        .into_iter()
        .find(|client| client.email.eq_ignore_ascii_case(email))
        .map(|client| client.name)
        .unwrap_or_else(|| email.to_string());
    Ok(InvoiceClient {
        name: if billing.legal_name.trim().is_empty() {
            name
        } else {
            billing.legal_name
        },
        email: email.to_string(),
        tax_id: Some(billing.tax_id).filter(|value| !value.is_empty()),
        address: Some(billing.address).filter(|value| !value.is_empty()),
    })
}

/// Primer día del mes desplazado `offset` meses.
fn month_offset(base: NaiveDate, offset: i64) -> NaiveDate {
    let total = base.year() as i64 * 12 + base.month0() as i64 + offset;
    let year = total.div_euclid(12) as i32;
    let month0 = total.rem_euclid(12) as u32;
    NaiveDate::from_ymd_opt(year, month0 + 1, 1).unwrap_or(base)
}

fn month_key(date: NaiveDate) -> String {
    date.format("%Y-%m").to_string()
}

fn month_bounds(month: &str) -> rusqlite::Result<(String, String)> {
    let first = NaiveDate::parse_from_str(&format!("{}-01", month), "%Y-%m-%d")
        .map_err(|error| rusqlite::Error::InvalidParameterName(error.to_string()))?;
    let next = month_offset(first, 1);
    let last = next - Duration::days(1);
    Ok((
        first.format("%Y-%m-%d").to_string(),
        last.format("%Y-%m-%d").to_string(),
    ))
}

/// Día válido del mes (evita el 31 en meses cortos).
fn safe_day(month: NaiveDate, day: u32) -> u32 {
    let last = (month_offset(month, 1) - Duration::days(1)).day();
    day.min(last)
}

fn start_local(month: NaiveDate, day: u32, hour: u32, minute: u32) -> String {
    format!(
        "{}-{:02}-{:02}T{:02}:{:02}:00",
        month.year(),
        month.month(),
        safe_day(month, day),
        hour,
        minute
    )
}

/// Fin del evento sumando minutos a una hora local `YYYY-MM-DDTHH:MM:SS`.
fn end_local(start: &str, duration_min: i64) -> String {
    let (date, time) = start.split_once('T').unwrap_or((start, "00:00:00"));
    let mut parts = time
        .split(':')
        .map(|value| value.parse::<i64>().unwrap_or(0));
    let hour = parts.next().unwrap_or(0);
    let minute = parts.next().unwrap_or(0);
    let total = hour * 60 + minute + duration_min;
    format!("{}T{:02}:{:02}:00", date, (total / 60) % 24, total % 60)
}

fn event_id(month: &str, label: &str, day: u32) -> String {
    format!("demo-{}-{}-{:02}", month, label, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        db::schema(&conn).unwrap();
        conn
    }

    #[test]
    fn seed_fills_the_database_with_a_rich_dataset() {
        let conn = conn();
        seed(&conn).unwrap();

        // Idempotente: sembrar dos veces no duplica nada.
        seed(&conn).unwrap();
        let events: i64 = conn
            .query_row("SELECT COUNT(*) FROM events", [], |row| row.get(0))
            .unwrap();
        assert_eq!(events, MONTHS * 9);

        // Estados de revisión variados, para probar la Importación.
        let pending: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM events WHERE accepted = 0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let cancelled: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM events WHERE status = 'cancelled'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let stale: i64 = conn
            .query_row("SELECT COUNT(*) FROM events WHERE stale = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        let discarded: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM events WHERE discarded = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let overrides: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM event_clients WHERE override_rate IS NOT NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pending, 2);
        assert_eq!(cancelled, 1);
        assert_eq!(stale, 1);
        assert_eq!(discarded, 1);
        assert_eq!(overrides, 1);

        // La empresa es un cliente manual con dos emails vinculados.
        let clients = db::list_clients(&conn).unwrap();
        let acme = clients.iter().find(|row| row.email == ACME).unwrap();
        assert_eq!(acme.name, "Acme S.L.");
        assert!(clients.iter().any(|row| row.name == "Grupo Los Olivos"));
        let aliases = db::list_client_aliases(&conn).unwrap();
        assert_eq!(aliases.len(), SHARED_STUDENTS.len());
    }

    #[test]
    fn seed_issues_invoices_that_mark_their_classes() {
        let conn = conn();
        seed(&conn).unwrap();

        let invoices = db::list_invoices(&conn).unwrap();
        assert_eq!(invoices.len(), INVOICES.len());
        assert!(invoices.iter().any(|invoice| invoice.client_email == ACME));

        // La factura del mes en curso de Acme incluye una de las dos clases
        // compartidas: el resto se queda «sin facturar» y el diálogo la bloquea.
        let today = Utc::now().date_naive();
        let (from, to) = month_bounds(&month_key(today)).unwrap();
        let rows =
            db::class_detail(&conn, &from, &to, Some(ACME), DEFAULT_RATE, SHARED_RATE).unwrap();
        assert_eq!(rows.len(), 4);
        let invoiced = rows.iter().filter(|row| row.invoice_id.is_some()).count();
        assert_eq!(invoiced, 2);
        assert!(rows.iter().all(|row| row.amount == SHARED_RATE));
    }
}

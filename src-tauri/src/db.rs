use crate::models::{
    Backup, BackupClient, BackupEvent, BackupName, BackupRate, BackupSetting, ClassClient,
    ClassDetail, ClassGroup, ClientEntry, ClientIncome, EventRow, InvoiceData, InvoiceRecord,
    MonthlyIncome, RateHistoryEntry,
};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;

pub struct Db(pub Mutex<Connection>);

pub fn init(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    schema(&conn)?;
    Ok(conn)
}

/// Crea (si no existen) todas las tablas, índices y columnas del esquema y
/// aplica las migraciones. Separado de [`init`] para poder montar el esquema
/// sobre una conexión en memoria en los tests.
fn schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;

         CREATE TABLE IF NOT EXISTS settings (
             key   TEXT PRIMARY KEY,
             value TEXT
         );

         CREATE TABLE IF NOT EXISTS events (
             id           TEXT PRIMARY KEY,
             calendar_id  TEXT NOT NULL,
             summary      TEXT,
             start_ts     TEXT NOT NULL,
             end_ts       TEXT NOT NULL,
             status       TEXT NOT NULL,
             duration_min INTEGER,
             updated_ts   TEXT
         );

         CREATE TABLE IF NOT EXISTS event_clients (
             event_id TEXT NOT NULL,
             email    TEXT NOT NULL,
             name     TEXT,
             rsvp     TEXT,
             PRIMARY KEY (event_id, email)
         );

         CREATE TABLE IF NOT EXISTS client_rate_history (
             email          TEXT NOT NULL,
             effective_from TEXT NOT NULL,
             rate           REAL,
             PRIMARY KEY (email, effective_from)
         );

         CREATE TABLE IF NOT EXISTS client_names (
             email TEXT PRIMARY KEY,
             name  TEXT NOT NULL
         );

         CREATE TABLE IF NOT EXISTS invoices (
             id            INTEGER PRIMARY KEY AUTOINCREMENT,
             series        TEXT NOT NULL,
             number        INTEGER NOT NULL,
             issued_on     TEXT NOT NULL,
             period        TEXT NOT NULL,
             client_email  TEXT NOT NULL,
             client_name   TEXT NOT NULL,
             client_tax_id TEXT,
             currency      TEXT NOT NULL,
             total         REAL NOT NULL,
             created_ts    TEXT NOT NULL,
             data          TEXT NOT NULL,
             UNIQUE (series, number)
         );

         CREATE INDEX IF NOT EXISTS idx_events_start    ON events(start_ts);
         CREATE INDEX IF NOT EXISTS idx_events_calendar ON events(calendar_id);
         CREATE INDEX IF NOT EXISTS idx_clients_email   ON event_clients(email);",
    )?;
    ensure_column(
        conn,
        "events",
        "accepted",
        "accepted INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(
        conn,
        "events",
        "discarded",
        "discarded INTEGER NOT NULL DEFAULT 0",
    )?;
    // `stale` = la clase ya no aparece en Google (se detecta al reimportar).
    ensure_column(conn, "events", "stale", "stale INTEGER NOT NULL DEFAULT 0")?;
    // `start_local` = inicio en la zona horaria del calendario de Google; sirve
    // para imputar la clase al día/mes correctos (evita el desfase UTC).
    ensure_column(conn, "events", "start_local", "start_local TEXT")?;
    // El cobro es siempre por clase; se elimina la antigua opción por hora.
    conn.execute("DELETE FROM settings WHERE key = 'rate_mode'", [])?;
    // Migra la tabla antigua `client_rates` (una tarifa por cliente) al histórico y la elimina.
    if table_exists(conn, "client_rates")? {
        conn.execute(
            "INSERT OR IGNORE INTO client_rate_history (email, effective_from, rate)
             SELECT email, '0000-01', rate FROM client_rates",
            [],
        )?;
        conn.execute("DROP TABLE client_rates", [])?;
    }
    Ok(())
}

fn table_exists(conn: &Connection, name: &str) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
        params![name],
        |_| Ok(()),
    )
    .optional()
    .map(|value| value.is_some())
}

fn ensure_column(conn: &Connection, table: &str, column: &str, ddl: &str) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let names: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(|row| row.ok())
        .collect();
    drop(stmt);
    if !names.iter().any(|name| name == column) {
        conn.execute(&format!("ALTER TABLE {} ADD COLUMN {}", table, ddl), [])?;
    }
    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn delete_setting(conn: &Connection, key: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
    Ok(())
}

pub fn upsert_event(conn: &mut Connection, event: &EventRow) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO events (id, calendar_id, summary, start_ts, start_local, end_ts, status, duration_min, updated_ts)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
             calendar_id  = excluded.calendar_id,
             summary      = excluded.summary,
             start_ts     = excluded.start_ts,
             start_local  = excluded.start_local,
             end_ts       = excluded.end_ts,
             status       = excluded.status,
             duration_min = excluded.duration_min,
             updated_ts   = excluded.updated_ts,
             discarded    = 0,
             stale        = 0",
        params![
            event.id,
            event.calendar_id,
            event.summary,
            event.start_ts,
            event.start_local,
            event.end_ts,
            event.status,
            event.duration_min,
            event.updated_ts
        ],
    )?;
    tx.execute(
        "DELETE FROM event_clients WHERE event_id = ?1",
        params![event.id],
    )?;
    for client in &event.clients {
        tx.execute(
            "INSERT OR REPLACE INTO event_clients (event_id, email, name, rsvp)
             VALUES (?1, ?2, ?3, ?4)",
            params![event.id, client.email, client.name, client.rsvp],
        )?;
    }
    tx.commit()
}

pub fn class_detail(
    conn: &Connection,
    from_date: &str,
    to_date: &str,
    email: Option<&str>,
    default_rate: f64,
    shared_rate: f64,
) -> rusqlite::Result<Vec<ClassDetail>> {
    let effective_rate = effective_rate_subquery("?4");
    let sql = format!(
        "SELECT e.id, e.summary, e.start_ts, e.end_ts, e.duration_min,
                ec.email, COALESCE(cn.name, ec.name, ec.email) AS name,
                COALESCE({eff}, ?4) AS client_rate,
                (SELECT COUNT(*) FROM event_clients ec2 WHERE ec2.event_id = e.id) AS attendee_count,
                COALESCE(e.start_local, e.start_ts) AS start_local
         FROM events e
         JOIN event_clients ec ON ec.event_id = e.id
         LEFT JOIN client_names cn ON cn.email = ec.email
         WHERE e.status != 'cancelled'
           AND e.accepted = 1
           AND e.discarded = 0
           AND e.stale = 0
           AND {local_date} >= ?1 AND {local_date} <= ?2
           AND (?3 IS NULL OR ec.email = ?3)
         ORDER BY e.start_ts DESC",
        eff = effective_rate,
        local_date = local_date_expr("e"),
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![from_date, to_date, email, default_rate], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<i64>>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, f64>(7)?,
            row.get::<_, i64>(8)?,
            row.get::<_, String>(9)?,
        ))
    })?;

    let mut detail = Vec::new();
    for row in rows {
        let (
            id,
            summary,
            start_ts,
            end_ts,
            duration_min,
            email,
            name,
            client_rate,
            attendees,
            start_local,
        ) = row?;
        let rate = if attendees > 1 {
            shared_rate
        } else {
            client_rate
        };
        let amount = rate;
        detail.push(ClassDetail {
            id,
            summary,
            start_ts,
            start_local,
            end_ts,
            duration_min,
            email,
            name,
            rate,
            amount,
        });
    }
    Ok(detail)
}

pub fn set_client_rate(
    conn: &Connection,
    email: &str,
    rate: Option<f64>,
    effective_from: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO client_rate_history (email, effective_from, rate) VALUES (?1, ?2, ?3)
         ON CONFLICT(email, effective_from) DO UPDATE SET rate = excluded.rate",
        params![email, effective_from, rate],
    )?;
    Ok(())
}

pub fn update_client_rate(
    conn: &Connection,
    email: &str,
    old_effective_from: &str,
    new_effective_from: &str,
    rate: Option<f64>,
) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "DELETE FROM client_rate_history WHERE email = ?1 AND effective_from = ?2",
        params![email, old_effective_from],
    )?;
    tx.execute(
        "INSERT INTO client_rate_history (email, effective_from, rate) VALUES (?1, ?2, ?3)
         ON CONFLICT(email, effective_from) DO UPDATE SET rate = excluded.rate",
        params![email, new_effective_from, rate],
    )?;
    tx.commit()
}

pub fn delete_client_rate(
    conn: &Connection,
    email: &str,
    effective_from: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM client_rate_history WHERE email = ?1 AND effective_from = ?2",
        params![email, effective_from],
    )?;
    Ok(())
}

pub fn list_client_rates(
    conn: &Connection,
    email: &str,
) -> rusqlite::Result<Vec<RateHistoryEntry>> {
    let mut stmt = conn.prepare(
        "SELECT effective_from, rate FROM client_rate_history
         WHERE email = ?1 ORDER BY effective_from DESC",
    )?;
    let rows = stmt.query_map(params![email], |row| {
        Ok(RateHistoryEntry {
            effective_from: row.get(0)?,
            rate: row.get(1)?,
        })
    })?;
    rows.collect()
}

pub fn set_client_name(conn: &Connection, email: &str, name: Option<&str>) -> rusqlite::Result<()> {
    match name {
        Some(name) if !name.trim().is_empty() => {
            conn.execute(
                "INSERT INTO client_names (email, name) VALUES (?1, ?2)
                 ON CONFLICT(email) DO UPDATE SET name = excluded.name",
                params![email, name.trim()],
            )?;
        }
        _ => {
            conn.execute("DELETE FROM client_names WHERE email = ?1", params![email])?;
        }
    }
    Ok(())
}

pub fn latest_event_month(conn: &Connection) -> Option<String> {
    conn.query_row(
        "SELECT MAX(COALESCE(substr(start_local, 1, 7), substr(start_ts, 1, 7))) FROM events",
        [],
        |row| row.get::<_, Option<String>>(0),
    )
    .ok()
    .flatten()
}

pub fn list_clients(conn: &Connection) -> rusqlite::Result<Vec<ClientEntry>> {
    let mut stmt = conn.prepare(
        "SELECT ec.email,
                COALESCE(cn.name, MAX(ec.name), ec.email) AS name,
                (SELECT h.rate FROM client_rate_history h
                  WHERE h.email = ec.email
                  ORDER BY h.effective_from DESC LIMIT 1) AS rate
         FROM event_clients ec
         LEFT JOIN client_names cn ON cn.email = ec.email
         GROUP BY ec.email
         ORDER BY name ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ClientEntry {
            email: row.get(0)?,
            name: row.get(1)?,
            rate: row.get(2)?,
        })
    })?;
    rows.collect()
}

pub fn accept_import(conn: &Connection, from_date: &str, to_date: &str) -> rusqlite::Result<usize> {
    let local_date = local_date_expr("events");
    conn.execute(
        &format!(
            "UPDATE events SET accepted = 1
             WHERE accepted = 0
               AND discarded = 0
               AND stale = 0
               AND status != 'cancelled'
               AND {local_date} >= ?1 AND {local_date} <= ?2",
            local_date = local_date,
        ),
        params![from_date, to_date],
    )
}

pub fn set_event_review(conn: &Connection, id: &str, state: &str) -> rusqlite::Result<()> {
    let (accepted, discarded, clear_stale) = review_flags(state);
    conn.execute(
        "UPDATE events
            SET accepted = ?2, discarded = ?3,
                stale = CASE WHEN ?4 THEN 0 ELSE stale END
          WHERE id = ?1",
        params![id, accepted, discarded, clear_stale],
    )?;
    Ok(())
}

/// Traduce el estado de revisión a `(accepted, discarded, limpiar_stale)`.
/// `restored` (restaurar una clase que ya no está en Google) además limpia `stale`.
fn review_flags(state: &str) -> (i64, i64, bool) {
    match state {
        "accepted" => (1, 0, false),
        "discarded" => (0, 1, false),
        "restored" => (0, 0, true),
        _ => (0, 0, false),
    }
}

pub fn set_events_review(
    conn: &mut Connection,
    ids: &[String],
    state: &str,
) -> rusqlite::Result<usize> {
    let (accepted, discarded, clear_stale) = review_flags(state);
    let tx = conn.transaction()?;
    let mut changed = 0;
    {
        let mut stmt = tx.prepare(
            "UPDATE events
                SET accepted = ?2, discarded = ?3,
                    stale = CASE WHEN ?4 THEN 0 ELSE stale END
              WHERE id = ?1",
        )?;
        for id in ids {
            changed += stmt.execute(params![id, accepted, discarded, clear_stale])?;
        }
    }
    tx.commit()?;
    Ok(changed)
}

pub fn pending_count(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM events
         WHERE accepted = 0 AND discarded = 0 AND stale = 0 AND status != 'cancelled'",
        [],
        |row| row.get(0),
    )
}

/// Indica si un evento ya está marcado como no presente en Google. Se consulta
/// antes de reimportarlo para contar cuántos se «restauran».
pub fn event_is_stale(conn: &Connection, id: &str) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT stale FROM events WHERE id = ?1",
        params![id],
        |row| row.get::<_, i64>(0),
    )
    .optional()
    .map(|value| value.unwrap_or(0) != 0)
}

/// Marca como `stale` los eventos de un calendario cuyo día local cae dentro de
/// `[from_date, to_date]` (`YYYY-MM-DD`) y que ya no aparecen en Google. `seen`
/// es el conjunto de ids que sí se han importado (y cualifican como clase) en
/// esta pasada. Solo se llama cuando la descarga del calendario ha terminado
/// correctamente, para no marcar por error eventos que no se descargaron.
pub fn mark_stale(
    conn: &Connection,
    calendar_id: &str,
    from_date: &str,
    to_date: &str,
    seen: &HashSet<String>,
) -> rusqlite::Result<usize> {
    let tx = conn.unchecked_transaction()?;
    let mut marked = 0usize;
    {
        let local_date = local_date_expr("events");
        let sql = format!(
            "SELECT id FROM events
             WHERE calendar_id = ?1
               AND {local_date} >= ?2 AND {local_date} <= ?3
               AND stale = 0",
            local_date = local_date,
        );
        let mut select = tx.prepare(&sql)?;
        let ids: Vec<String> = select
            .query_map(params![calendar_id, from_date, to_date], |row| {
                row.get::<_, String>(0)
            })?
            .filter_map(|row| row.ok())
            .collect();
        drop(select);
        let mut update = tx.prepare("UPDATE events SET stale = 1 WHERE id = ?1")?;
        for id in ids {
            if !seen.contains(&id) {
                marked += update.execute(params![id])?;
            }
        }
    }
    tx.commit()?;
    Ok(marked)
}

/// Día local del evento (`YYYY-MM-DD`): usa `start_local` y, si falta (filas
/// importadas antes de guardar la zona horaria), cae al día UTC de `start_ts`.
fn local_date_expr(alias: &str) -> String {
    format!(
        "COALESCE(substr({alias}.start_local, 1, 10), substr({alias}.start_ts, 1, 10))",
        alias = alias,
    )
}

/// Mes local del evento (`YYYY-MM`), con el mismo fallback que [`local_date_expr`].
fn local_month_expr(alias: &str) -> String {
    format!(
        "COALESCE(substr({alias}.start_local, 1, 7), substr({alias}.start_ts, 1, 7))",
        alias = alias,
    )
}

/// Subconsulta que devuelve la tarifa del cliente vigente en el mes del evento
/// (`e` y `ec` deben estar en el FROM). Usa el histórico `client_rate_history`:
/// la última entrada con `effective_from <= mes del evento`. Una entrada con
/// `rate` NULL significa «usar la tarifa normal». `default_ph` es el placeholder
/// de la tarifa normal.
fn effective_rate_subquery(default_ph: &str) -> String {
    format!(
        "(SELECT CASE WHEN h.rate IS NULL THEN {default_ph} ELSE h.rate END
           FROM client_rate_history h
          WHERE h.email = ec.email
            AND h.effective_from <= {month}
          ORDER BY h.effective_from DESC LIMIT 1)",
        default_ph = default_ph,
        month = local_month_expr("e"),
    )
}

/// Expresión SQL de la tarifa por alumno de una fila (evento × cliente):
/// si la clase es compartida (>1 invitado) usa la tarifa compartida; si no, la
/// tarifa del cliente vigente en el mes del evento o, en su defecto, la normal.
/// `default_ph`/`shared_ph` son los placeholders de los dos parámetros de tarifa.
fn rate_expression(default_ph: &str, shared_ph: &str) -> String {
    format!(
        "CASE WHEN (SELECT COUNT(*) FROM event_clients ec2 WHERE ec2.event_id = e.id) > 1
              THEN {shared_ph}
              ELSE COALESCE({eff}, {default_ph}) END",
        shared_ph = shared_ph,
        eff = effective_rate_subquery(default_ph),
        default_ph = default_ph,
    )
}

pub fn income_by_client(
    conn: &Connection,
    from_date: &str,
    to_date: &str,
    month: Option<&str>,
    default_rate: f64,
    shared_rate: f64,
) -> rusqlite::Result<Vec<ClientIncome>> {
    let amount = rate_expression("?4", "?5");
    let sql = format!(
        "SELECT ec.email,
                COALESCE(MAX(cn.name), MAX(ec.name), ec.email) AS name,
                COUNT(DISTINCT e.id) AS classes,
                COALESCE(SUM({amount}), 0) AS amount,
                (SELECT h.rate FROM client_rate_history h
                  WHERE h.email = ec.email
                  ORDER BY h.effective_from DESC LIMIT 1) AS rate
         FROM event_clients ec
         JOIN events e ON e.id = ec.event_id
         LEFT JOIN client_names cn ON cn.email = ec.email
         WHERE e.status != 'cancelled'
           AND e.accepted = 1
           AND e.discarded = 0
           AND e.stale = 0
           AND {local_date} >= ?1 AND {local_date} <= ?2
           AND (?3 IS NULL OR {local_month} = ?3)
         GROUP BY ec.email
         ORDER BY amount DESC, name ASC",
        amount = amount,
        local_date = local_date_expr("e"),
        local_month = local_month_expr("e"),
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        params![from_date, to_date, month, default_rate, shared_rate],
        |row| {
            Ok(ClientIncome {
                email: row.get(0)?,
                name: row.get(1)?,
                classes: row.get(2)?,
                amount: row.get(3)?,
                rate: row.get(4)?,
            })
        },
    )?;
    rows.collect()
}

pub fn income_by_month(
    conn: &Connection,
    from_date: &str,
    to_date: &str,
    default_rate: f64,
    shared_rate: f64,
) -> rusqlite::Result<Vec<MonthlyIncome>> {
    let amount = rate_expression("?3", "?4");
    let sql = format!(
        "SELECT {local_month} AS month,
                COUNT(DISTINCT e.id) AS classes,
                COALESCE(SUM({amount}), 0) AS amount
         FROM event_clients ec
         JOIN events e ON e.id = ec.event_id
         WHERE e.status != 'cancelled'
           AND e.accepted = 1
           AND e.discarded = 0
           AND e.stale = 0
           AND {local_date} >= ?1 AND {local_date} <= ?2
         GROUP BY month
         ORDER BY month",
        amount = amount,
        local_month = local_month_expr("e"),
        local_date = local_date_expr("e"),
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        params![from_date, to_date, default_rate, shared_rate],
        |row| {
            Ok(MonthlyIncome {
                month: row.get(0)?,
                classes: row.get(1)?,
                amount: row.get(2)?,
            })
        },
    )?;
    rows.collect()
}

pub fn list_classes(
    conn: &Connection,
    from_date: &str,
    to_date: &str,
    default_rate: f64,
    shared_rate: f64,
) -> rusqlite::Result<Vec<ClassGroup>> {
    let effective_rate = effective_rate_subquery("?3");
    let sql = format!(
        "SELECT e.id, e.summary, e.start_ts, e.end_ts, e.duration_min,
                ec.email, COALESCE(cn.name, ec.name, ec.email) AS name,
                COALESCE({eff}, ?3) AS client_rate,
                (SELECT COUNT(*) FROM event_clients ec2 WHERE ec2.event_id = e.id) AS attendee_count,
                e.accepted, e.discarded, e.stale,
                COALESCE(e.start_local, e.start_ts) AS start_local
         FROM events e
         JOIN event_clients ec ON ec.event_id = e.id
         LEFT JOIN client_names cn ON cn.email = ec.email
         WHERE e.status != 'cancelled'
           AND {local_date} >= ?1 AND {local_date} <= ?2
         ORDER BY e.start_ts DESC, name ASC",
        eff = effective_rate,
        local_date = local_date_expr("e"),
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![from_date, to_date, default_rate], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<i64>>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, f64>(7)?,
            row.get::<_, i64>(8)?,
            row.get::<_, i64>(9)?,
            row.get::<_, i64>(10)?,
            row.get::<_, i64>(11)?,
            row.get::<_, String>(12)?,
        ))
    })?;

    let mut groups: Vec<ClassGroup> = Vec::new();
    for row in rows {
        let (
            id,
            summary,
            start_ts,
            end_ts,
            duration_min,
            email,
            name,
            client_rate,
            attendees,
            accepted,
            discarded,
            stale,
            start_local,
        ) = row?;
        let shared = attendees > 1;
        let rate = if shared { shared_rate } else { client_rate };
        let amount = rate;

        let client = ClassClient {
            email,
            name,
            amount,
        };

        if let Some(group) = groups.iter_mut().find(|group| group.id == id) {
            group.total_amount += client.amount;
            group.clients.push(client);
        } else {
            groups.push(ClassGroup {
                id,
                summary,
                start_ts,
                start_local,
                end_ts,
                duration_min,
                shared,
                accepted: accepted != 0,
                discarded: discarded != 0,
                stale: stale != 0,
                total_amount: client.amount,
                clients: vec![client],
            });
        }
    }

    Ok(groups)
}

/// Claves de `settings` que nunca se incluyen en la copia de seguridad.
const BACKUP_SECRET_KEYS: [&str; 1] = ["client_secret"];

pub fn export_backup(conn: &Connection, exported_at: &str) -> rusqlite::Result<Backup> {
    let mut stmt = conn.prepare(
        "SELECT id, calendar_id, summary, start_ts, end_ts, status, duration_min, updated_ts,
                accepted, discarded, stale, start_local
         FROM events ORDER BY start_ts",
    )?;
    let events = stmt
        .query_map([], |row| {
            Ok(BackupEvent {
                id: row.get(0)?,
                calendar_id: row.get(1)?,
                summary: row.get(2)?,
                start_ts: row.get(3)?,
                end_ts: row.get(4)?,
                status: row.get(5)?,
                duration_min: row.get(6)?,
                updated_ts: row.get(7)?,
                accepted: row.get(8)?,
                discarded: row.get(9)?,
                stale: row.get(10)?,
                start_local: row.get(11)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);

    let mut stmt = conn.prepare("SELECT event_id, email, name, rsvp FROM event_clients")?;
    let event_clients = stmt
        .query_map([], |row| {
            Ok(BackupClient {
                event_id: row.get(0)?,
                email: row.get(1)?,
                name: row.get(2)?,
                rsvp: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);

    let mut stmt = conn.prepare("SELECT email, effective_from, rate FROM client_rate_history")?;
    let client_rate_history = stmt
        .query_map([], |row| {
            Ok(BackupRate {
                email: row.get(0)?,
                effective_from: row.get(1)?,
                rate: row.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);

    let mut stmt = conn.prepare("SELECT email, name FROM client_names")?;
    let client_names = stmt
        .query_map([], |row| {
            Ok(BackupName {
                email: row.get(0)?,
                name: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);

    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let settings = stmt
        .query_map([], |row| {
            Ok(BackupSetting {
                key: row.get(0)?,
                value: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<BackupSetting>>>()?
        .into_iter()
        .filter(|setting| !BACKUP_SECRET_KEYS.contains(&setting.key.as_str()))
        .collect();

    Ok(Backup {
        version: 1,
        exported_at: exported_at.to_string(),
        events,
        event_clients,
        client_rate_history,
        client_names,
        settings,
    })
}

pub fn import_backup(conn: &mut Connection, backup: &Backup) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM events", [])?;
    tx.execute("DELETE FROM event_clients", [])?;
    tx.execute("DELETE FROM client_rate_history", [])?;
    tx.execute("DELETE FROM client_names", [])?;
    tx.execute("DELETE FROM settings WHERE key != 'client_secret'", [])?;

    for event in &backup.events {
        tx.execute(
            "INSERT INTO events (id, calendar_id, summary, start_ts, end_ts, status, duration_min,
                                 updated_ts, accepted, discarded, stale, start_local)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                event.id,
                event.calendar_id,
                event.summary,
                event.start_ts,
                event.end_ts,
                event.status,
                event.duration_min,
                event.updated_ts,
                event.accepted,
                event.discarded,
                event.stale,
                event.start_local
            ],
        )?;
    }

    for client in &backup.event_clients {
        tx.execute(
            "INSERT OR REPLACE INTO event_clients (event_id, email, name, rsvp)
             VALUES (?1, ?2, ?3, ?4)",
            params![client.event_id, client.email, client.name, client.rsvp],
        )?;
    }

    for rate in &backup.client_rate_history {
        tx.execute(
            "INSERT OR REPLACE INTO client_rate_history (email, effective_from, rate)
             VALUES (?1, ?2, ?3)",
            params![rate.email, rate.effective_from, rate.rate],
        )?;
    }

    for name in &backup.client_names {
        tx.execute(
            "INSERT OR REPLACE INTO client_names (email, name) VALUES (?1, ?2)",
            params![name.email, name.name],
        )?;
    }

    for setting in &backup.settings {
        tx.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![setting.key, setting.value],
        )?;
    }

    tx.commit()
}

/// Siguiente número de factura dentro de una serie (p. ej. el año).
pub fn next_invoice_number(conn: &Connection, series: &str) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COALESCE(MAX(number), 0) + 1 FROM invoices WHERE series = ?1",
        params![series],
        |row| row.get(0),
    )
}

pub fn insert_invoice(
    conn: &Connection,
    series: &str,
    number: i64,
    created_ts: &str,
    data: &InvoiceData,
) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO invoices (series, number, issued_on, period, client_email, client_name,
                               client_tax_id, currency, total, created_ts, data)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            series,
            number,
            data.issued_on,
            data.period,
            data.client.email,
            data.client.name,
            data.client.tax_id,
            data.currency,
            data.total,
            created_ts,
            serde_json::to_string(data)
                .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_invoices(conn: &Connection) -> rusqlite::Result<Vec<InvoiceRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, series, number, issued_on, period, client_name, client_email, total, currency
         FROM invoices
         ORDER BY series DESC, number DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        let series: String = row.get(1)?;
        let number: i64 = row.get(2)?;
        Ok(InvoiceRecord {
            id: row.get(0)?,
            number: format!("{}-{:04}", series, number),
            issued_on: row.get(3)?,
            period: row.get(4)?,
            client_name: row.get(5)?,
            client_email: row.get(6)?,
            total: row.get(7)?,
            currency: row.get(8)?,
        })
    })?;
    rows.collect()
}

pub fn get_invoice_data(conn: &Connection, id: i64) -> rusqlite::Result<Option<InvoiceData>> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT data FROM invoices WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(raw.and_then(|json| serde_json::from_str(&json).ok()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ClientRef, EventRow};

    const DEFAULT: f64 = 20.0;
    const SHARED: f64 = 10.0;
    // Límites por día local (`YYYY-MM-DD`), no instantes UTC.
    const FROM: &str = "2000-01-01";
    const TO: &str = "3000-12-31";

    fn conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        schema(&conn).unwrap();
        conn
    }

    fn add_event(
        conn: &Connection,
        id: &str,
        start: &str,
        accepted: i64,
        clients: &[(&str, &str)],
    ) {
        let end = start.replace("T10:", "T11:");
        conn.execute(
            "INSERT INTO events (id, calendar_id, summary, start_ts, end_ts, status,
                                 duration_min, updated_ts, accepted, discarded)
             VALUES (?1, 'primary', 'Clase', ?2, ?3, 'confirmed', 60, NULL, ?4, 0)",
            params![id, start, end, accepted],
        )
        .unwrap();
        for (email, name) in clients {
            conn.execute(
                "INSERT INTO event_clients (event_id, email, name, rsvp)
                 VALUES (?1, ?2, ?3, 'accepted')",
                params![id, email, name],
            )
            .unwrap();
        }
    }

    fn client_amount(rows: &[ClientIncome], email: &str) -> f64 {
        rows.iter().find(|row| row.email == email).unwrap().amount
    }

    #[test]
    fn income_individual_uses_rate_of_event_month() {
        let conn = conn();
        set_client_rate(&conn, "a@x", Some(30.0), "2024-01").unwrap();
        set_client_rate(&conn, "a@x", Some(40.0), "2024-06").unwrap();
        add_event(&conn, "e1", "2024-02-05T10:00:00Z", 1, &[("a@x", "Ana")]);
        add_event(&conn, "e2", "2024-07-05T10:00:00Z", 1, &[("a@x", "Ana")]);
        add_event(&conn, "e3", "2023-12-05T10:00:00Z", 1, &[("a@x", "Ana")]);

        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].classes, 3);
        assert_eq!(client_amount(&rows, "a@x"), 30.0 + 40.0 + DEFAULT);
    }

    #[test]
    fn null_history_rate_falls_back_to_default() {
        let conn = conn();
        set_client_rate(&conn, "b@x", None, "2024-01").unwrap();
        add_event(&conn, "e1", "2024-03-05T10:00:00Z", 1, &[("b@x", "Bruno")]);

        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED).unwrap();
        assert_eq!(client_amount(&rows, "b@x"), DEFAULT);
    }

    #[test]
    fn shared_class_uses_shared_rate_per_student() {
        let conn = conn();
        set_client_rate(&conn, "a@x", Some(30.0), "2024-01").unwrap();
        add_event(
            &conn,
            "e1",
            "2024-03-05T10:00:00Z",
            1,
            &[("a@x", "Ana"), ("b@x", "Bruno")],
        );

        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED).unwrap();
        assert_eq!(client_amount(&rows, "a@x"), SHARED);
        assert_eq!(client_amount(&rows, "b@x"), SHARED);

        let groups = list_classes(&conn, FROM, TO, DEFAULT, SHARED).unwrap();
        assert_eq!(groups.len(), 1);
        assert!(groups[0].shared);
        assert_eq!(groups[0].clients.len(), 2);
        assert_eq!(groups[0].total_amount, SHARED * 2.0);
    }

    #[test]
    fn income_by_month_groups_per_month() {
        let conn = conn();
        add_event(&conn, "e1", "2024-01-05T10:00:00Z", 1, &[("a@x", "Ana")]);
        add_event(&conn, "e2", "2024-01-19T10:00:00Z", 1, &[("a@x", "Ana")]);
        add_event(&conn, "e3", "2024-02-05T10:00:00Z", 1, &[("b@x", "Bruno")]);

        let rows = income_by_month(&conn, FROM, TO, DEFAULT, SHARED).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].month, "2024-01");
        assert_eq!(rows[0].classes, 2);
        assert_eq!(rows[0].amount, DEFAULT * 2.0);
        assert_eq!(rows[1].month, "2024-02");
        assert_eq!(rows[1].amount, DEFAULT);
    }

    #[test]
    fn month_and_range_use_local_day() {
        let conn = conn();
        // Clase a las 00:30 del 1 de marzo en Madrid (UTC+1) = 2024-02-29T23:30:00Z.
        // Debe imputarse a marzo (día local), no a febrero (día UTC).
        conn.execute(
            "INSERT INTO events (id, calendar_id, summary, start_ts, start_local, end_ts, status,
                                 duration_min, updated_ts, accepted, discarded)
             VALUES ('e1', 'primary', 'Clase', '2024-02-29T23:30:00Z', '2024-03-01T00:30:00',
                     '2024-03-01T00:30:00Z', 'confirmed', 60, NULL, 1, 0)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO event_clients (event_id, email, name, rsvp)
             VALUES ('e1', 'a@x', 'Ana', 'accepted')",
            [],
        )
        .unwrap();

        let march = income_by_month(&conn, "2024-03-01", "2024-03-31", DEFAULT, SHARED).unwrap();
        assert_eq!(march.len(), 1);
        assert_eq!(march[0].month, "2024-03");

        let february = income_by_month(&conn, "2024-02-01", "2024-02-29", DEFAULT, SHARED).unwrap();
        assert!(february.is_empty());
    }

    #[test]
    fn accept_import_moves_pending_events() {
        let conn = conn();
        add_event(&conn, "e1", "2024-04-05T10:00:00Z", 0, &[("a@x", "Ana")]);
        add_event(&conn, "e2", "2024-04-12T10:00:00Z", 0, &[("a@x", "Ana")]);
        assert_eq!(pending_count(&conn).unwrap(), 2);

        let accepted = accept_import(&conn, FROM, TO).unwrap();
        assert_eq!(accepted, 2);
        assert_eq!(pending_count(&conn).unwrap(), 0);

        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED).unwrap();
        assert_eq!(rows[0].classes, 2);
    }

    #[test]
    fn bulk_review_discards_and_restores() {
        let mut conn = conn();
        add_event(&conn, "e1", "2024-05-05T10:00:00Z", 1, &[("a@x", "Ana")]);
        add_event(&conn, "e2", "2024-05-12T10:00:00Z", 1, &[("a@x", "Ana")]);

        let ids = vec!["e2".to_string()];
        let changed = set_events_review(&mut conn, &ids, "discarded").unwrap();
        assert_eq!(changed, 1);

        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED).unwrap();
        assert_eq!(rows[0].classes, 1);

        let changed = set_events_review(&mut conn, &ids, "pending").unwrap();
        assert_eq!(changed, 1);
        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED).unwrap();
        assert_eq!(rows[0].classes, 1); // sigue sin estar aceptada
        assert_eq!(pending_count(&conn).unwrap(), 1);
    }

    #[test]
    fn mark_stale_flags_events_missing_from_source() {
        let conn = conn();
        add_event(&conn, "e1", "2024-05-05T10:00:00Z", 1, &[("a@x", "Ana")]);
        add_event(&conn, "e2", "2024-05-12T10:00:00Z", 1, &[("a@x", "Ana")]);

        // e2 ha dejado de aparecer en Google.
        let seen: HashSet<String> = ["e1".to_string()].into_iter().collect();
        let marked = mark_stale(&conn, "primary", FROM, TO, &seen).unwrap();
        assert_eq!(marked, 1);

        // Deja de contar en el histórico, pero sigue en la lista de importación.
        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED).unwrap();
        assert_eq!(rows[0].classes, 1);

        let groups = list_classes(&conn, FROM, TO, DEFAULT, SHARED).unwrap();
        assert!(groups.iter().find(|g| g.id == "e2").unwrap().stale);
        assert!(!groups.iter().find(|g| g.id == "e1").unwrap().stale);

        // Marcar de nuevo no vuelve a contar los ya marcados.
        assert_eq!(mark_stale(&conn, "primary", FROM, TO, &seen).unwrap(), 0);
    }

    #[test]
    fn reappearing_event_clears_stale() {
        let mut conn = conn();
        let event = EventRow {
            id: "e1".to_string(),
            calendar_id: "primary".to_string(),
            summary: Some("Clase".to_string()),
            start_ts: "2024-06-05T10:00:00Z".to_string(),
            start_local: Some("2024-06-05T10:00:00".to_string()),
            end_ts: "2024-06-05T11:00:00Z".to_string(),
            status: "confirmed".to_string(),
            duration_min: Some(60),
            updated_ts: None,
            clients: vec![ClientRef {
                email: "a@x".to_string(),
                name: Some("Ana".to_string()),
                rsvp: Some("accepted".to_string()),
            }],
        };
        upsert_event(&mut conn, &event).unwrap();
        mark_stale(&conn, "primary", FROM, TO, &HashSet::new()).unwrap();
        assert!(event_is_stale(&conn, "e1").unwrap());

        upsert_event(&mut conn, &event).unwrap();
        assert!(!event_is_stale(&conn, "e1").unwrap());
    }

    #[test]
    fn restored_review_clears_stale() {
        let conn = conn();
        add_event(&conn, "e1", "2024-05-05T10:00:00Z", 1, &[("a@x", "Ana")]);
        mark_stale(&conn, "primary", FROM, TO, &HashSet::new()).unwrap();
        assert!(event_is_stale(&conn, "e1").unwrap());

        set_event_review(&conn, "e1", "restored").unwrap();
        assert!(!event_is_stale(&conn, "e1").unwrap());
        assert_eq!(pending_count(&conn).unwrap(), 1);
    }

    #[test]
    fn upsert_event_persists_clients_and_resets_discarded() {
        let mut conn = conn();
        let event = EventRow {
            id: "e1".to_string(),
            calendar_id: "primary".to_string(),
            summary: Some("Clase".to_string()),
            start_ts: "2024-06-05T10:00:00Z".to_string(),
            start_local: Some("2024-06-05T10:00:00".to_string()),
            end_ts: "2024-06-05T11:00:00Z".to_string(),
            status: "confirmed".to_string(),
            duration_min: Some(60),
            updated_ts: None,
            clients: vec![ClientRef {
                email: "a@x".to_string(),
                name: Some("Ana".to_string()),
                rsvp: Some("accepted".to_string()),
            }],
        };
        upsert_event(&mut conn, &event).unwrap();
        set_event_review(&conn, "e1", "discarded").unwrap();
        assert_eq!(pending_count(&conn).unwrap(), 0);

        upsert_event(&mut conn, &event).unwrap();
        let groups = list_classes(&conn, FROM, TO, DEFAULT, SHARED).unwrap();
        assert_eq!(groups.len(), 1);
        assert!(!groups[0].discarded);
        assert_eq!(groups[0].clients.len(), 1);
    }

    #[test]
    fn invoice_numbering_is_per_series_and_registry_round_trips() {
        use crate::models::{InvoiceClient, InvoiceIssuer, InvoiceLine};

        let conn = conn();
        assert_eq!(next_invoice_number(&conn, "2026").unwrap(), 1);

        let data = InvoiceData {
            number: "2026-0001".to_string(),
            issued_on: "2026-02-01".to_string(),
            period: "2026-01".to_string(),
            currency: "€".to_string(),
            issuer: InvoiceIssuer {
                name: "Ana".to_string(),
                tax_id: "12345678A".to_string(),
                address: String::new(),
                email: "ana@x".to_string(),
                phone: None,
            },
            client: InvoiceClient {
                name: "Bruno".to_string(),
                email: "bruno@x".to_string(),
                tax_id: None,
            },
            lines: vec![InvoiceLine {
                date: "2026-01-05T10:00:00Z".to_string(),
                concept: "Clase".to_string(),
                duration_min: Some(60),
                rate: 30.0,
                amount: 30.0,
            }],
            total: 30.0,
        };

        let id = insert_invoice(&conn, "2026", 1, "2026-02-01T10:00:00Z", &data).unwrap();
        assert_eq!(next_invoice_number(&conn, "2026").unwrap(), 2);
        assert_eq!(next_invoice_number(&conn, "2025").unwrap(), 1);

        let list = list_invoices(&conn).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].number, "2026-0001");
        assert_eq!(list[0].client_name, "Bruno");
        assert_eq!(list[0].total, 30.0);

        let back = get_invoice_data(&conn, id).unwrap().unwrap();
        assert_eq!(back.number, "2026-0001");
        assert_eq!(back.lines.len(), 1);
        assert_eq!(back.issuer.tax_id, "12345678A");
    }
}

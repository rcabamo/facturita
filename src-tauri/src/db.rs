use crate::models::{
    ClassClient, ClassDetail, ClassGroup, ClientEntry, ClientIncome, ClientStat, EventRow,
    MonthlyIncome, MonthlyStat,
};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::Mutex;

pub struct Db(pub Mutex<Connection>);

pub fn init(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
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

         CREATE TABLE IF NOT EXISTS client_rates (
             email TEXT PRIMARY KEY,
             rate  REAL NOT NULL
         );

         CREATE TABLE IF NOT EXISTS client_names (
             email TEXT PRIMARY KEY,
             name  TEXT NOT NULL
         );

         CREATE INDEX IF NOT EXISTS idx_events_start    ON events(start_ts);
         CREATE INDEX IF NOT EXISTS idx_events_calendar ON events(calendar_id);
         CREATE INDEX IF NOT EXISTS idx_clients_email   ON event_clients(email);",
    )?;
    ensure_column(&conn, "events", "accepted", "accepted INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(&conn, "events", "discarded", "discarded INTEGER NOT NULL DEFAULT 0")?;
    Ok(conn)
}

fn ensure_column(
    conn: &Connection,
    table: &str,
    column: &str,
    ddl: &str,
) -> rusqlite::Result<()> {
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
        "INSERT INTO events (id, calendar_id, summary, start_ts, end_ts, status, duration_min, updated_ts)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
             calendar_id  = excluded.calendar_id,
             summary      = excluded.summary,
             start_ts     = excluded.start_ts,
             end_ts       = excluded.end_ts,
             status       = excluded.status,
             duration_min = excluded.duration_min,
             updated_ts   = excluded.updated_ts,
             discarded    = 0",
        params![
            event.id,
            event.calendar_id,
            event.summary,
            event.start_ts,
            event.end_ts,
            event.status,
            event.duration_min,
            event.updated_ts
        ],
    )?;
    tx.execute("DELETE FROM event_clients WHERE event_id = ?1", params![event.id])?;
    for client in &event.clients {
        tx.execute(
            "INSERT OR REPLACE INTO event_clients (event_id, email, name, rsvp)
             VALUES (?1, ?2, ?3, ?4)",
            params![event.id, client.email, client.name, client.rsvp],
        )?;
    }
    tx.commit()
}

pub fn monthly_stats(
    conn: &Connection,
    from_ts: &str,
    to_ts: &str,
) -> rusqlite::Result<Vec<MonthlyStat>> {
    let mut stmt = conn.prepare(
        "SELECT substr(e.start_ts, 1, 7) AS month, COUNT(DISTINCT e.id) AS classes
         FROM events e
         WHERE e.status != 'cancelled'
           AND e.start_ts >= ?1 AND e.start_ts < ?2
           AND EXISTS (SELECT 1 FROM event_clients ec WHERE ec.event_id = e.id)
         GROUP BY month
         ORDER BY month",
    )?;
    let rows = stmt.query_map(params![from_ts, to_ts], |row| {
        Ok(MonthlyStat {
            month: row.get(0)?,
            classes: row.get(1)?,
        })
    })?;
    rows.collect()
}

pub fn client_stats(
    conn: &Connection,
    from_ts: &str,
    to_ts: &str,
    month: Option<&str>,
) -> rusqlite::Result<Vec<ClientStat>> {
    let mut stmt = conn.prepare(
        "SELECT ec.email,
                COALESCE(MAX(ec.name), ec.email) AS name,
                COUNT(DISTINCT e.id) AS classes
         FROM event_clients ec
         JOIN events e ON e.id = ec.event_id
         WHERE e.status != 'cancelled'
           AND e.start_ts >= ?1 AND e.start_ts < ?2
           AND (?3 IS NULL OR substr(e.start_ts, 1, 7) = ?3)
         GROUP BY ec.email
         ORDER BY classes DESC, name ASC",
    )?;
    let rows = stmt.query_map(params![from_ts, to_ts, month], |row| {
        Ok(ClientStat {
            email: row.get(0)?,
            name: row.get(1)?,
            classes: row.get(2)?,
        })
    })?;
    rows.collect()
}

pub fn class_detail(
    conn: &Connection,
    from_ts: &str,
    to_ts: &str,
    email: Option<&str>,
) -> rusqlite::Result<Vec<ClassDetail>> {
    let mut stmt = conn.prepare(
        "SELECT e.id, e.summary, e.start_ts, e.end_ts, e.duration_min,
                ec.email, COALESCE(cn.name, ec.name, ec.email) AS name
         FROM events e
         JOIN event_clients ec ON ec.event_id = e.id
         LEFT JOIN client_names cn ON cn.email = ec.email
         WHERE e.status != 'cancelled'
           AND e.accepted = 1
           AND e.discarded = 0
           AND e.start_ts >= ?1 AND e.start_ts < ?2
           AND (?3 IS NULL OR ec.email = ?3)
         ORDER BY e.start_ts DESC",
    )?;
    let rows = stmt.query_map(params![from_ts, to_ts, email], |row| {
        Ok(ClassDetail {
            id: row.get(0)?,
            summary: row.get(1)?,
            start_ts: row.get(2)?,
            end_ts: row.get(3)?,
            duration_min: row.get(4)?,
            email: row.get(5)?,
            name: row.get(6)?,
        })
    })?;
    rows.collect()
}

pub fn set_client_rate(conn: &Connection, email: &str, rate: Option<f64>) -> rusqlite::Result<()> {
    match rate {
        Some(rate) => {
            conn.execute(
                "INSERT INTO client_rates (email, rate) VALUES (?1, ?2)
                 ON CONFLICT(email) DO UPDATE SET rate = excluded.rate",
                params![email, rate],
            )?;
        }
        None => {
            conn.execute("DELETE FROM client_rates WHERE email = ?1", params![email])?;
        }
    }
    Ok(())
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
        "SELECT MAX(substr(start_ts, 1, 7)) FROM events",
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
                MAX(cr.rate) AS rate
         FROM event_clients ec
         LEFT JOIN client_names cn ON cn.email = ec.email
         LEFT JOIN client_rates cr ON cr.email = ec.email
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

pub fn accept_import(conn: &Connection, from_ts: &str, to_ts: &str) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE events SET accepted = 1
         WHERE accepted = 0
           AND discarded = 0
           AND status != 'cancelled'
           AND start_ts >= ?1 AND start_ts < ?2",
        params![from_ts, to_ts],
    )
}

pub fn set_event_review(conn: &Connection, id: &str, state: &str) -> rusqlite::Result<()> {
    let (accepted, discarded) = match state {
        "accepted" => (1, 0),
        "discarded" => (0, 1),
        _ => (0, 0),
    };
    conn.execute(
        "UPDATE events SET accepted = ?2, discarded = ?3 WHERE id = ?1",
        params![id, accepted, discarded],
    )?;
    Ok(())
}

/// Expresión SQL de la tarifa por alumno de una fila (evento × cliente):
/// si la clase es compartida (>1 invitado) usa la tarifa compartida; si no, la
/// tarifa del cliente (override) o la normal. `default_ph`/`shared_ph` son los
/// placeholders de los dos parámetros de tarifa.
fn rate_expression(default_ph: &str, shared_ph: &str) -> String {
    format!(
        "CASE WHEN (SELECT COUNT(*) FROM event_clients ec2 WHERE ec2.event_id = e.id) > 1
              THEN {shared_ph}
              ELSE COALESCE(cr.rate, {default_ph}) END",
        shared_ph = shared_ph,
        default_ph = default_ph,
    )
}

fn amount_expression(mode: &str, rate_expr: &str) -> String {
    if mode == "class" {
        rate_expr.to_string()
    } else {
        format!("({}) * e.duration_min / 60.0", rate_expr)
    }
}

pub fn income_by_client(
    conn: &Connection,
    from_ts: &str,
    to_ts: &str,
    month: Option<&str>,
    mode: &str,
    default_rate: f64,
    shared_rate: f64,
) -> rusqlite::Result<Vec<ClientIncome>> {
    let amount = amount_expression(mode, &rate_expression("?4", "?5"));
    let sql = format!(
        "SELECT ec.email,
                COALESCE(MAX(cn.name), MAX(ec.name), ec.email) AS name,
                COUNT(DISTINCT e.id) AS classes,
                COALESCE(SUM(e.duration_min), 0) AS minutes,
                COALESCE(SUM({amount}), 0) AS amount,
                MAX(cr.rate) AS rate
         FROM event_clients ec
         JOIN events e ON e.id = ec.event_id
         LEFT JOIN client_rates cr ON cr.email = ec.email
         LEFT JOIN client_names cn ON cn.email = ec.email
         WHERE e.status != 'cancelled'
           AND e.accepted = 1
           AND e.discarded = 0
           AND e.start_ts >= ?1 AND e.start_ts < ?2
           AND (?3 IS NULL OR substr(e.start_ts, 1, 7) = ?3)
         GROUP BY ec.email
         ORDER BY amount DESC, name ASC",
        amount = amount,
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        params![from_ts, to_ts, month, default_rate, shared_rate],
        |row| {
            Ok(ClientIncome {
                email: row.get(0)?,
                name: row.get(1)?,
                classes: row.get(2)?,
                minutes: row.get(3)?,
                amount: row.get(4)?,
                rate: row.get(5)?,
            })
        },
    )?;
    rows.collect()
}

pub fn income_by_month(
    conn: &Connection,
    from_ts: &str,
    to_ts: &str,
    mode: &str,
    default_rate: f64,
    shared_rate: f64,
) -> rusqlite::Result<Vec<MonthlyIncome>> {
    let amount = amount_expression(mode, &rate_expression("?3", "?4"));
    let sql = format!(
        "SELECT substr(e.start_ts, 1, 7) AS month,
                COUNT(DISTINCT e.id) AS classes,
                COALESCE(SUM({amount}), 0) AS amount
         FROM event_clients ec
         JOIN events e ON e.id = ec.event_id
         LEFT JOIN client_rates cr ON cr.email = ec.email
         WHERE e.status != 'cancelled'
           AND e.accepted = 1
           AND e.discarded = 0
           AND e.start_ts >= ?1 AND e.start_ts < ?2
         GROUP BY month
         ORDER BY month",
        amount = amount,
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![from_ts, to_ts, default_rate, shared_rate], |row| {
        Ok(MonthlyIncome {
            month: row.get(0)?,
            classes: row.get(1)?,
            amount: row.get(2)?,
        })
    })?;
    rows.collect()
}

pub fn list_classes(
    conn: &Connection,
    from_ts: &str,
    to_ts: &str,
    mode: &str,
    default_rate: f64,
    shared_rate: f64,
) -> rusqlite::Result<Vec<ClassGroup>> {
    let mut stmt = conn.prepare(
        "SELECT e.id, e.summary, e.start_ts, e.end_ts, e.duration_min,
                ec.email, COALESCE(cn.name, ec.name, ec.email) AS name, cr.rate,
                (SELECT COUNT(*) FROM event_clients ec2 WHERE ec2.event_id = e.id) AS attendee_count,
                e.accepted, e.discarded
         FROM events e
         JOIN event_clients ec ON ec.event_id = e.id
         LEFT JOIN client_rates cr ON cr.email = ec.email
         LEFT JOIN client_names cn ON cn.email = ec.email
         WHERE e.status != 'cancelled'
           AND e.start_ts >= ?1 AND e.start_ts < ?2
         ORDER BY e.start_ts DESC, name ASC",
    )?;
    let rows = stmt.query_map(params![from_ts, to_ts], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<i64>>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, Option<f64>>(7)?,
            row.get::<_, i64>(8)?,
            row.get::<_, i64>(9)?,
            row.get::<_, i64>(10)?,
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
        ) = row?;
        let shared = attendees > 1;
        let rate = if shared {
            shared_rate
        } else {
            client_rate.unwrap_or(default_rate)
        };
        let amount = if mode == "class" {
            rate
        } else {
            rate * duration_min.unwrap_or(0) as f64 / 60.0
        };

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
                end_ts,
                duration_min,
                shared,
                accepted: accepted != 0,
                discarded: discarded != 0,
                total_amount: client.amount,
                clients: vec![client],
            });
        }
    }

    Ok(groups)
}

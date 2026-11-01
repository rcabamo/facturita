use crate::models::{
    Backup, BackupAlias, BackupBilling, BackupClient, BackupEvent, BackupManualClient, BackupName,
    BackupRate, BackupSetting, ClassClient, ClassDetail, ClassGroup, ClientAlias, ClientBilling,
    ClientEntry, ClientIncome, EventRow, InvoiceData, InvoiceRecord, MonthlyIncome,
    RateHistoryEntry,
};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::{HashMap, HashSet};
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
pub(crate) fn schema(conn: &Connection) -> rusqlite::Result<()> {
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

         -- Varios emails de Google pueden pertenecer al mismo cliente (p. ej.
         -- una empresa con un email por empleado). `client_email` es el email
         -- canónico bajo el que se agrupan clases, nombre y tarifas.
         CREATE TABLE IF NOT EXISTS client_aliases (
             email        TEXT PRIMARY KEY,
             client_email TEXT NOT NULL
         );

         -- Datos fiscales del cliente para sus facturas.
         CREATE TABLE IF NOT EXISTS client_billing (
             email      TEXT PRIMARY KEY,
             legal_name TEXT NOT NULL DEFAULT '',
             tax_id     TEXT NOT NULL DEFAULT '',
             address    TEXT NOT NULL DEFAULT ''
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

         -- Qué clases (eventos) entran en cada factura. Permite avisar de
         -- clases ya facturadas y agrupar las clases por factura.
         CREATE TABLE IF NOT EXISTS invoice_events (
             invoice_id INTEGER NOT NULL,
             event_id   TEXT NOT NULL,
             PRIMARY KEY (invoice_id, event_id)
         );

         CREATE INDEX IF NOT EXISTS idx_invoice_events_event ON invoice_events(event_id);

         -- Clientes creados a mano (p. ej. una empresa que no aparece como
         -- invitada en el calendario y bajo la que se agrupan varios alumnos).
         -- `email` es la clave: un email real o una clave interna
         -- (`manual-<slug>`) cuando el cliente no tiene email propio.
         CREATE TABLE IF NOT EXISTS manual_clients (
             email      TEXT PRIMARY KEY,
             name       TEXT NOT NULL DEFAULT '',
             created_ts TEXT NOT NULL
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
    // `billable` = el invitado cuenta para la clase. Permite excluir a alguien
    // invitado a la convocatoria (p. ej. un padre) sin borrarlo del evento.
    ensure_column(
        conn,
        "event_clients",
        "billable",
        "billable INTEGER NOT NULL DEFAULT 1",
    )?;
    // `override_rate` = tarifa/hora manual para este alumno en esta clase. NULL
    // significa «usar la tarifa compartida, la del cliente o la normal».
    ensure_column(conn, "event_clients", "override_rate", "override_rate REAL")?;
    // Migración de la primera versión del importe manual por clase: aquellos
    // valores se guardaban como importe total. Solo se copian una vez.
    if get_setting(conn, "migrated_override_rate").is_none() {
        let _ = conn.execute(
            "UPDATE event_clients SET override_rate = override_amount
              WHERE override_rate IS NULL AND override_amount IS NOT NULL",
            [],
        );
        set_setting(conn, "migrated_override_rate", "1")?;
    }
    // `include_cancelled` = el usuario ha decidido que una clase cancelada en
    // Google cuente igualmente (por defecto los cancelados se importan pero no
    // computan).
    ensure_column(
        conn,
        "events",
        "include_cancelled",
        "include_cancelled INTEGER NOT NULL DEFAULT 0",
    )?;
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
    // Facturas emitidas antes de asociar cada línea a su clase: se intenta
    // deducir la clase (solo cuando hay una única candidata ese día).
    if get_setting(conn, "migrated_invoice_events").is_none() {
        let _ = backfill_invoice_events(conn);
        set_setting(conn, "migrated_invoice_events", "1")?;
    }
    Ok(())
}

/// Asocia las líneas de las facturas antiguas (anteriores a `invoice_events`)
/// con su evento, cuando la coincidencia es inequívoca: mismo cliente, mismo
/// día local y una única clase ese día. Las demás se quedan sin asociar.
fn backfill_invoice_events(conn: &Connection) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare(
        "SELECT id, client_email, data FROM invoices
          WHERE id NOT IN (SELECT invoice_id FROM invoice_events)",
    )?;
    let pending: Vec<(i64, String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .filter_map(|row| row.ok())
        .collect();
    drop(stmt);

    let canonical = canonical_email_expr("ec");
    let sql = format!(
        "SELECT DISTINCT e.id
           FROM events e
           JOIN event_clients ec ON ec.event_id = e.id
          WHERE ec.billable = 1
            AND e.accepted = 1
            AND e.discarded = 0
            AND e.stale = 0
            AND {included_status}
            AND {canonical} = ?1 COLLATE NOCASE
            AND {local_date} = ?2
            AND e.id NOT IN (SELECT event_id FROM invoice_events)",
        included_status = included_status_expr("e"),
        canonical = canonical,
        local_date = local_date_expr("e"),
    );

    for (invoice_id, client_email, raw) in pending {
        let Ok(data) = serde_json::from_str::<crate::models::InvoiceData>(&raw) else {
            continue;
        };
        for line in data.lines {
            let Some(day) = line.date.get(0..10) else {
                continue;
            };
            let candidates: Vec<String> = conn
                .prepare(&sql)?
                .query_map(params![client_email, day], |row| row.get(0))?
                .filter_map(|row| row.ok())
                .collect();
            if candidates.len() == 1 {
                conn.execute(
                    "INSERT OR IGNORE INTO invoice_events (invoice_id, event_id) VALUES (?1, ?2)",
                    params![invoice_id, candidates[0]],
                )?;
            }
        }
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
    let cancelled = event.status.eq_ignore_ascii_case("cancelled");
    // Los cancelados se importan ya revisados (`accepted = 1`) pero sin contar
    // (`include_cancelled = 0`): el usuario decide después si los incluye.
    tx.execute(
        "INSERT INTO events (id, calendar_id, summary, start_ts, start_local, end_ts, status,
                             duration_min, updated_ts, accepted, include_cancelled)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0)
         ON CONFLICT(id) DO UPDATE SET
             calendar_id  = excluded.calendar_id,
             summary      = excluded.summary,
             start_ts     = excluded.start_ts,
             start_local  = excluded.start_local,
             end_ts       = excluded.end_ts,
             status       = excluded.status,
             duration_min = excluded.duration_min,
             updated_ts   = excluded.updated_ts,
             accepted     = CASE WHEN excluded.status = 'cancelled'
                                 THEN 1 ELSE events.accepted END,
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
            event.updated_ts,
            cancelled as i64
        ],
    )?;
    // Se conserva la selección manual de invitados que cuentan (`billable`) y
    // la tarifa/hora manual (`override_rate`) para los emails que siguen en la
    // convocatoria; una reimportación no debe deshacer ninguno de los ajustes.
    let previous: HashMap<String, (bool, Option<f64>)> = {
        let mut stmt = tx.prepare(
            "SELECT email, billable, override_rate FROM event_clients WHERE event_id = ?1",
        )?;
        let rows = stmt.query_map(params![event.id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)? != 0,
                row.get::<_, Option<f64>>(2)?,
            ))
        })?;
        rows.filter_map(|row| row.ok())
            .map(|(email, billable, rate)| (email.to_ascii_lowercase(), (billable, rate)))
            .collect()
    };
    type PendingClient<'a> = (&'a str, Option<&'a str>, Option<&'a str>, bool, Option<f64>);
    let mut clients: Vec<PendingClient> = event
        .clients
        .iter()
        .map(|client| {
            let (billable, override_rate) = previous
                .get(&client.email.to_ascii_lowercase())
                .copied()
                .unwrap_or((true, None));
            (
                client.email.as_str(),
                client.name.as_deref(),
                client.rsvp.as_deref(),
                billable,
                override_rate,
            )
        })
        .collect();
    // Si el único alumno que contaba ha desaparecido de Google, no se deja la
    // clase sin nadie que cuente: se vuelve a contar a todos los invitados.
    if !clients.iter().any(|(_, _, _, billable, _)| *billable) {
        for client in &mut clients {
            client.3 = true;
        }
    }

    tx.execute(
        "DELETE FROM event_clients WHERE event_id = ?1",
        params![event.id],
    )?;
    for (email, name, rsvp, billable, override_rate) in clients {
        tx.execute(
            "INSERT OR REPLACE INTO event_clients
                 (event_id, email, name, rsvp, billable, override_rate)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![event.id, email, name, rsvp, billable as i64, override_rate],
        )?;
    }
    tx.commit()
}

/// Fija una tarifa/hora manual para un alumno en una clase concreta. `None`
/// vuelve a la tarifa automática (compartida, del cliente o normal).
pub fn set_event_client_rate(
    conn: &Connection,
    id: &str,
    email: &str,
    rate: Option<f64>,
) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE event_clients SET override_rate = ?3
          WHERE event_id = ?1 AND email = ?2 COLLATE NOCASE",
        params![id, email, rate],
    )
}

/// Marca qué invitados de una clase cuentan para el cómputo. `emails` debe
/// incluir al menos un invitado del evento; el resto quedan excluidos. Devuelve
/// cuántos invitados se han marcado (0 si el evento o los emails no existen).
pub fn set_event_billable_clients(
    conn: &Connection,
    id: &str,
    emails: &[String],
) -> rusqlite::Result<usize> {
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "UPDATE event_clients SET billable = 0 WHERE event_id = ?1",
        params![id],
    )?;
    let mut changed = 0;
    {
        let mut stmt =
            tx.prepare("UPDATE event_clients SET billable = 1 WHERE event_id = ?1 AND email = ?2")?;
        for email in emails {
            changed += stmt.execute(params![id, email])?;
        }
    }
    if changed == 0 {
        // Sin cambios: se deja que la transacción se revierta al soltarse.
        return Ok(0);
    }
    tx.commit()?;
    Ok(changed)
}

/// Decide si una clase cancelada en Google cuenta en el cómputo. Al incluirla
/// se marca como aceptada (y se limpia un posible descarte) para que aparezca
/// en Histórico, ingresos, facturas y CSV.
pub fn set_event_cancelled_included(
    conn: &Connection,
    id: &str,
    included: bool,
) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE events
            SET include_cancelled = ?2,
                accepted = CASE WHEN ?2 THEN 1 ELSE accepted END,
                discarded = CASE WHEN ?2 THEN 0 ELSE discarded END
          WHERE id = ?1",
        params![id, included as i64],
    )
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
    let canonical = canonical_email_expr("ec");
    let sql = format!(
        "SELECT e.id, e.summary, e.start_ts, e.end_ts, e.duration_min,
                ec.email, {client_name} AS name,
                COALESCE({eff}, ?4) AS client_rate,
                (SELECT COUNT(*) FROM event_clients ec2
                  WHERE ec2.event_id = e.id AND ec2.billable = 1) AS attendee_count,
                COALESCE(e.start_local, e.start_ts) AS start_local,
                ec.override_rate,
                inv.id, inv.series, inv.number
         FROM events e
         JOIN event_clients ec ON ec.event_id = e.id
         LEFT JOIN client_names cn ON cn.email = {canonical} COLLATE NOCASE
         LEFT JOIN invoice_events ie ON ie.event_id = e.id
         LEFT JOIN invoices inv
                ON inv.id = ie.invoice_id
               AND inv.client_email = {canonical} COLLATE NOCASE
         WHERE {included_status}
           AND e.accepted = 1
           AND e.discarded = 0
           AND e.stale = 0
           AND ec.billable = 1
           AND {local_date} >= ?1 AND {local_date} <= ?2
           AND (?3 IS NULL OR {canonical} = ?3 COLLATE NOCASE)
         ORDER BY e.start_ts DESC",
        eff = effective_rate,
        client_name = client_name_expr("ec"),
        canonical = canonical,
        included_status = included_status_expr("e"),
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
            row.get::<_, Option<f64>>(10)?,
            row.get::<_, Option<i64>>(11)?,
            row.get::<_, Option<String>>(12)?,
            row.get::<_, Option<i64>>(13)?,
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
            override_rate,
            invoice_id,
            invoice_series,
            invoice_number,
        ) = row?;
        let rate = override_rate.unwrap_or(if attendees > 1 {
            shared_rate
        } else {
            client_rate
        });
        let amount = if override_rate.is_some() {
            rate * event_hours(duration_min)
        } else {
            rate
        };
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
            overridden: override_rate.is_some(),
            invoice_id,
            invoice_number: match (invoice_series, invoice_number) {
                (Some(series), Some(number)) => Some(format!("{}-{:04}", series, number)),
                _ => None,
            },
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

pub fn get_client_billing(conn: &Connection, email: &str) -> rusqlite::Result<ClientBilling> {
    conn.query_row(
        "SELECT legal_name, tax_id, address FROM client_billing
          WHERE email = ?1 COLLATE NOCASE",
        params![email],
        |row| {
            Ok(ClientBilling {
                legal_name: row.get(0)?,
                tax_id: row.get(1)?,
                address: row.get(2)?,
            })
        },
    )
    .optional()
    .map(|value| value.unwrap_or_default())
}

pub fn set_client_billing(
    conn: &Connection,
    email: &str,
    billing: &ClientBilling,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO client_billing (email, legal_name, tax_id, address)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(email) DO UPDATE SET
             legal_name = excluded.legal_name,
             tax_id     = excluded.tax_id,
             address    = excluded.address",
        params![
            email,
            billing.legal_name.trim(),
            billing.tax_id.trim(),
            billing.address.trim()
        ],
    )?;
    Ok(())
}

pub fn list_client_aliases(conn: &Connection) -> rusqlite::Result<Vec<ClientAlias>> {
    let mut stmt = conn
        .prepare("SELECT email, client_email FROM client_aliases ORDER BY client_email, email")?;
    let rows = stmt.query_map([], |row| {
        Ok(ClientAlias {
            email: row.get(0)?,
            client_email: row.get(1)?,
        })
    })?;
    rows.collect()
}

/// Vincula `email` al cliente canónico `client_email`. A partir de ese momento
/// las clases importadas de ese email se suman al cliente (y sus clases ya
/// importadas también). Si el email era a su vez el cliente de otros emails,
/// esos pasan al nuevo cliente.
pub fn link_client_alias(
    conn: &Connection,
    email: &str,
    client_email: &str,
) -> rusqlite::Result<()> {
    let email = email.trim().to_lowercase();
    let client_email = client_email.trim().to_lowercase();
    if email.is_empty() || client_email.is_empty() || email == client_email {
        return Ok(());
    }
    let tx = conn.unchecked_transaction()?;
    // Si el destino ya es un alias, se resuelve a su cliente canónico.
    let target: String = tx
        .query_row(
            "SELECT client_email FROM client_aliases WHERE email = ?1 COLLATE NOCASE",
            params![client_email],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or_else(|| client_email.clone());
    if target.eq_ignore_ascii_case(&email) {
        return Err(rusqlite::Error::InvalidParameterName(
            "No se puede vincular un email consigo mismo.".to_string(),
        ));
    }
    // Los emails que dependían del que se mueve pasan al destino.
    tx.execute(
        "UPDATE client_aliases SET client_email = ?1
          WHERE client_email = ?2 COLLATE NOCASE",
        params![target, email],
    )?;
    tx.execute(
        "INSERT INTO client_aliases (email, client_email) VALUES (?1, ?2)
         ON CONFLICT(email) DO UPDATE SET client_email = excluded.client_email",
        params![email, target],
    )?;
    // Se conservan el nombre y las tarifas propios del email vinculado si el
    // cliente destino todavía no los tenía.
    let nombre_destino: bool = tx
        .query_row(
            "SELECT 1 FROM client_names WHERE email = ?1 COLLATE NOCASE",
            params![target],
            |_| Ok(()),
        )
        .optional()?
        .is_some();
    if !nombre_destino {
        tx.execute(
            "UPDATE OR IGNORE client_names SET email = ?1 WHERE email = ?2 COLLATE NOCASE",
            params![target, email],
        )?;
    }
    tx.execute(
        "UPDATE OR IGNORE client_rate_history SET email = ?1 WHERE email = ?2 COLLATE NOCASE",
        params![target, email],
    )?;
    // Los datos fiscales del email vinculado se conservan si el destino no los
    // tenía todavía.
    tx.execute(
        "INSERT OR IGNORE INTO client_billing (email, legal_name, tax_id, address)
         SELECT ?1, legal_name, tax_id, address FROM client_billing
          WHERE email = ?2 COLLATE NOCASE",
        params![target, email],
    )?;
    tx.execute(
        "DELETE FROM client_rate_history WHERE email = ?1 COLLATE NOCASE",
        params![email],
    )?;
    tx.execute(
        "DELETE FROM client_names WHERE email = ?1 COLLATE NOCASE",
        params![email],
    )?;
    tx.execute(
        "DELETE FROM client_billing WHERE email = ?1 COLLATE NOCASE",
        params![email],
    )?;
    tx.commit()
}

/// Separa un email del cliente al que estaba vinculado: vuelve a contar como
/// cliente propio, manteniendo las clases ya importadas.
pub fn unlink_client_alias(conn: &Connection, email: &str) -> rusqlite::Result<usize> {
    conn.execute(
        "DELETE FROM client_aliases WHERE email = ?1 COLLATE NOCASE",
        params![email],
    )
}

/// Borra clases, invitaciones, nombres, tarifas de cliente, vínculos de emails
/// y facturas. Los ajustes (credenciales, tarifas globales, datos fiscales,
/// tema…) se conservan.
pub fn clear_all_data(conn: &Connection) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    for table in [
        "events",
        "event_clients",
        "client_rate_history",
        "client_names",
        "client_aliases",
        "client_billing",
        "manual_clients",
        "invoice_events",
        "invoices",
    ] {
        tx.execute(&format!("DELETE FROM {}", table), [])?;
    }
    tx.execute("DELETE FROM settings WHERE key = 'last_sync'", [])?;
    // La numeración de facturas vuelve a empezar (no es obligatorio, pero deja
    // la app realmente «como nueva»).
    let _ = tx.execute("DELETE FROM sqlite_sequence WHERE name = 'invoices'", []);
    tx.commit()
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
    let canonical = canonical_email_expr("ec");
    let sql = format!(
        "SELECT {canonical} AS email,
                {client_name} AS name,
                (SELECT h.rate FROM client_rate_history h
                  WHERE h.email = {canonical} COLLATE NOCASE
                  ORDER BY h.effective_from DESC LIMIT 1) AS rate
         FROM event_clients ec
         JOIN events e ON e.id = ec.event_id
         LEFT JOIN client_names cn ON cn.email = {canonical} COLLATE NOCASE
         WHERE ec.billable = 1
           AND (e.status != 'cancelled' OR e.include_cancelled = 1)
         GROUP BY {canonical}
         UNION ALL
         SELECT m.email,
                COALESCE(cn.name, m.name, m.email),
                (SELECT h.rate FROM client_rate_history h
                  WHERE h.email = m.email COLLATE NOCASE
                  ORDER BY h.effective_from DESC LIMIT 1)
         FROM manual_clients m
         LEFT JOIN client_names cn ON cn.email = m.email COLLATE NOCASE
         WHERE m.email NOT IN (SELECT {canonical} FROM event_clients ec)
         ORDER BY name ASC",
        client_name = client_name_expr("ec"),
        canonical = canonical,
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |row| {
        Ok(ClientEntry {
            email: row.get(0)?,
            name: row.get(1)?,
            rate: row.get(2)?,
        })
    })?;
    rows.collect()
}

/// `true` si la clave ya la usa algún cliente (creado a mano, invitado del
/// calendario, email vinculado o con datos guardados).
fn client_key_taken(conn: &Connection, key: &str) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT 1 WHERE
             EXISTS (SELECT 1 FROM manual_clients  WHERE email = ?1 COLLATE NOCASE)
          OR EXISTS (SELECT 1 FROM event_clients   WHERE email = ?1 COLLATE NOCASE)
          OR EXISTS (SELECT 1 FROM client_aliases  WHERE email = ?1 COLLATE NOCASE
                                                      OR client_email = ?1 COLLATE NOCASE)
          OR EXISTS (SELECT 1 FROM client_names    WHERE email = ?1 COLLATE NOCASE)
          OR EXISTS (SELECT 1 FROM client_billing  WHERE email = ?1 COLLATE NOCASE)",
        params![key],
        |_| Ok(()),
    )
    .optional()
    .map(|value| value.is_some())
}

/// Crea un cliente a mano. Con email, se usa como clave (así se le pueden
/// vincular alumnos con `link_client_alias`); sin email se genera una clave
/// interna `manual-<slug>` que no se muestra en la interfaz.
pub fn create_manual_client(
    conn: &Connection,
    name: &str,
    email: Option<&str>,
    created_ts: &str,
) -> rusqlite::Result<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(rusqlite::Error::InvalidParameterName(
            "El nombre del cliente es obligatorio.".to_string(),
        ));
    }
    let key = match email.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => {
            if !value.contains('@') || value.split_whitespace().count() != 1 {
                return Err(rusqlite::Error::InvalidParameterName(
                    "El email no es válido.".to_string(),
                ));
            }
            value.to_lowercase()
        }
        None => {
            let base = format!("manual-{}", crate::slugify(name));
            let base = if base == "manual-" {
                "manual-cliente".to_string()
            } else {
                base
            };
            let mut candidate = base.clone();
            let mut suffix = 2;
            while client_key_taken(conn, &candidate)? {
                candidate = format!("{}-{}", base, suffix);
                suffix += 1;
            }
            candidate
        }
    };
    if client_key_taken(conn, &key)? {
        return Err(rusqlite::Error::InvalidParameterName(
            "Ya existe un cliente con ese email.".to_string(),
        ));
    }
    conn.execute(
        "INSERT INTO manual_clients (email, name, created_ts) VALUES (?1, ?2, ?3)",
        params![key, name, created_ts],
    )?;
    Ok(key)
}

/// Elimina un cliente creado a mano. Solo si no tiene emails vinculados ni
/// clases (si no, antes hay que separar los emails).
pub fn delete_manual_client(conn: &Connection, email: &str) -> rusqlite::Result<()> {
    let email = email.trim();
    let is_manual: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM manual_clients WHERE email = ?1 COLLATE NOCASE",
            params![email],
            |row| row.get(0),
        )
        .optional()?;
    if is_manual.is_none() {
        return Err(rusqlite::Error::InvalidParameterName(
            "Solo se pueden eliminar los clientes creados a mano.".to_string(),
        ));
    }
    let aliases: i64 = conn.query_row(
        "SELECT COUNT(*) FROM client_aliases WHERE client_email = ?1 COLLATE NOCASE",
        params![email],
        |row| row.get(0),
    )?;
    if aliases > 0 {
        return Err(rusqlite::Error::InvalidParameterName(
            "Separa antes los emails vinculados a este cliente.".to_string(),
        ));
    }
    let classes: i64 = conn.query_row(
        "SELECT COUNT(*) FROM event_clients WHERE email = ?1 COLLATE NOCASE",
        params![email],
        |row| row.get(0),
    )?;
    if classes > 0 {
        return Err(rusqlite::Error::InvalidParameterName(
            "Este cliente tiene clases propias; no se puede eliminar.".to_string(),
        ));
    }
    let tx = conn.unchecked_transaction()?;
    for table in [
        "manual_clients",
        "client_names",
        "client_billing",
        "client_rate_history",
    ] {
        tx.execute(
            &format!("DELETE FROM {} WHERE email = ?1 COLLATE NOCASE", table),
            params![email],
        )?;
    }
    tx.commit()
}

/// Clientes creados a mano (email, nombre visible y tarifa vigente).
pub fn manual_clients(conn: &Connection) -> rusqlite::Result<Vec<ClientEntry>> {
    let mut stmt = conn.prepare(
        "SELECT m.email,
                COALESCE(cn.name, m.name, m.email),
                (SELECT h.rate FROM client_rate_history h
                  WHERE h.email = m.email COLLATE NOCASE
                  ORDER BY h.effective_from DESC LIMIT 1)
           FROM manual_clients m
           LEFT JOIN client_names cn ON cn.email = m.email COLLATE NOCASE
          ORDER BY 2 ASC",
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

/// Un evento cuenta si no está cancelado en Google o si el usuario ha decidido
/// incluirlo expresamente (`include_cancelled = 1`).
fn included_status_expr(alias: &str) -> String {
    format!(
        "({alias}.status != 'cancelled' OR {alias}.include_cancelled = 1)",
        alias = alias,
    )
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

/// Email canónico del cliente para una fila de `event_clients` con el alias
/// `alias`: si el email está vinculado a un cliente (`client_aliases`), usa el
/// email de ese cliente; si no, el propio email del invitado.
fn canonical_email_expr(alias: &str) -> String {
    format!(
        "COALESCE((SELECT ca.client_email FROM client_aliases ca
                    WHERE ca.email = {alias}.email COLLATE NOCASE), {alias}.email)",
        alias = alias,
    )
}

/// Nombre visible del cliente para una fila de `event_clients` con el alias
/// `alias` (requiere el `LEFT JOIN client_names cn`). Prioridad: nombre puesto a
/// mano (`client_names`), nombre del cliente creado a mano (`manual_clients`,
/// p. ej. una empresa), nombre del invitado en Google y, por último, el email.
fn client_name_expr(alias: &str) -> String {
    let canonical = canonical_email_expr(alias);
    format!(
        "COALESCE(cn.name,
                  (SELECT m.name FROM manual_clients m
                    WHERE m.email = {canonical} COLLATE NOCASE),
                  {alias}.name,
                  {canonical})",
        canonical = canonical,
        alias = alias,
    )
}

/// Horas de una clase a partir de su duración en minutos. Si falta la duración
/// (filas antiguas o eventos raros) se asume una hora.
fn event_hours(duration_min: Option<i64>) -> f64 {
    duration_min.unwrap_or(60).max(1) as f64 / 60.0
}

/// Expresión SQL de las horas de una clase (misma regla que [`event_hours`]).
fn duration_hours_expr(alias: &str) -> String {
    format!(
        "(MAX(COALESCE({alias}.duration_min, 60), 1) / 60.0)",
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
          WHERE h.email = {canonical} COLLATE NOCASE
            AND h.effective_from <= {month}
          ORDER BY h.effective_from DESC LIMIT 1)",
        default_ph = default_ph,
        canonical = canonical_email_expr("ec"),
        month = local_month_expr("e"),
    )
}

/// Expresión SQL del importe por alumno de una fila (evento × cliente): una
/// tarifa/hora manual (`event_clients.override_rate`) manda siempre y se
/// multiplica por la duración; si no, una clase compartida usa la tarifa
/// compartida y una individual la del cliente vigente en el mes del evento o,
/// en su defecto, la normal. `default_ph`/`shared_ph` son los placeholders de
/// los dos parámetros de tarifa.
fn rate_expression(default_ph: &str, shared_ph: &str) -> String {
    format!(
        "CASE WHEN ec.override_rate IS NOT NULL
              THEN ec.override_rate * {hours}
              WHEN (SELECT COUNT(*) FROM event_clients ec2
                     WHERE ec2.event_id = e.id AND ec2.billable = 1) > 1
              THEN {shared_ph}
              ELSE COALESCE({eff}, {default_ph}) END",
        hours = duration_hours_expr("e"),
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
    include_manual: bool,
) -> rusqlite::Result<Vec<ClientIncome>> {
    let amount = rate_expression("?4", "?5");
    let canonical = canonical_email_expr("ec");
    let sql = format!(
        "SELECT {canonical} AS email,
                {client_name} AS name,
                COUNT(DISTINCT e.id) AS classes,
                COALESCE(SUM({amount}), 0) AS amount,
                (SELECT h.rate FROM client_rate_history h
                  WHERE h.email = {canonical} COLLATE NOCASE
                  ORDER BY h.effective_from DESC LIMIT 1) AS rate
         FROM event_clients ec
         JOIN events e ON e.id = ec.event_id
         LEFT JOIN client_names cn ON cn.email = {canonical} COLLATE NOCASE
         WHERE {included_status}
           AND e.accepted = 1
           AND e.discarded = 0
           AND e.stale = 0
           AND ec.billable = 1
           AND {local_date} >= ?1 AND {local_date} <= ?2
           AND (?3 IS NULL OR {local_month} = ?3)
         GROUP BY {canonical}
         ORDER BY amount DESC, name ASC",
        amount = amount,
        client_name = client_name_expr("ec"),
        canonical = canonical,
        included_status = included_status_expr("e"),
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
                manual: false,
            })
        },
    )?;
    let mut income: Vec<ClientIncome> = rows.collect::<rusqlite::Result<_>>()?;
    drop(stmt);
    if include_manual {
        // Los clientes creados a mano sin clases en el periodo también se
        // listan (con 0 clases), para poder abrirlos y vincularles emails.
        let present: std::collections::HashSet<String> =
            income.iter().map(|row| row.email.to_lowercase()).collect();
        for client in manual_clients(conn)? {
            if !present.contains(&client.email.to_lowercase()) {
                income.push(ClientIncome {
                    email: client.email,
                    name: client.name,
                    classes: 0,
                    amount: 0.0,
                    rate: client.rate,
                    manual: true,
                });
            }
        }
    }
    Ok(income)
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
         WHERE {included_status}
           AND e.accepted = 1
           AND e.discarded = 0
           AND e.stale = 0
           AND ec.billable = 1
           AND {local_date} >= ?1 AND {local_date} <= ?2
         GROUP BY month
         ORDER BY month",
        amount = amount,
        included_status = included_status_expr("e"),
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
    let canonical = canonical_email_expr("ec");
    let sql = format!(
        "SELECT e.id, e.summary, e.start_ts, e.end_ts, e.duration_min,
                ec.email, {client_name} AS name,
                COALESCE({eff}, ?3) AS client_rate,
                (SELECT COUNT(*) FROM event_clients ec2
                  WHERE ec2.event_id = e.id AND ec2.billable = 1) AS attendee_count,
                e.accepted, e.discarded, e.stale,
                COALESCE(e.start_local, e.start_ts) AS start_local,
                ec.billable, e.status, e.include_cancelled,
                ec.override_rate, {canonical} AS client_key
         FROM events e
         JOIN event_clients ec ON ec.event_id = e.id
         LEFT JOIN client_names cn ON cn.email = {canonical} COLLATE NOCASE
         WHERE {local_date} >= ?1 AND {local_date} <= ?2
         ORDER BY e.start_ts DESC, name ASC",
        eff = effective_rate,
        client_name = client_name_expr("ec"),
        canonical = canonical,
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
            row.get::<_, i64>(13)?,
            row.get::<_, String>(14)?,
            row.get::<_, i64>(15)?,
            row.get::<_, Option<f64>>(16)?,
            row.get::<_, String>(17)?,
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
            billable,
            status,
            include_cancelled,
            override_rate,
            client_key,
        ) = row?;
        let shared = attendees > 1;
        let cancelled = status.eq_ignore_ascii_case("cancelled");
        // Un invitado excluido sigue visible en Importación (para poder
        // volver a incluirlo) pero no suma importe.
        let amount = if billable != 0 {
            match override_rate {
                Some(rate) => rate * event_hours(duration_min),
                None => {
                    if shared {
                        shared_rate
                    } else {
                        client_rate
                    }
                }
            }
        } else {
            0.0
        };

        let client = ClassClient {
            email,
            client_key,
            name,
            amount,
            billable: billable != 0,
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
                cancelled,
                included: include_cancelled != 0,
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
                accepted, discarded, stale, start_local, include_cancelled
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
                include_cancelled: row.get(12)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);

    let mut stmt = conn.prepare(
        "SELECT event_id, email, name, rsvp, billable, override_rate FROM event_clients",
    )?;
    let event_clients = stmt
        .query_map([], |row| {
            Ok(BackupClient {
                event_id: row.get(0)?,
                email: row.get(1)?,
                name: row.get(2)?,
                rsvp: row.get(3)?,
                billable: row.get(4)?,
                override_rate: row.get(5)?,
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

    let mut stmt = conn.prepare("SELECT email, client_email FROM client_aliases")?;
    let client_aliases = stmt
        .query_map([], |row| {
            Ok(BackupAlias {
                email: row.get(0)?,
                client_email: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);

    let mut stmt = conn.prepare("SELECT email, legal_name, tax_id, address FROM client_billing")?;
    let client_billing = stmt
        .query_map([], |row| {
            Ok(BackupBilling {
                email: row.get(0)?,
                legal_name: row.get(1)?,
                tax_id: row.get(2)?,
                address: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);

    let mut stmt = conn.prepare("SELECT email, name, created_ts FROM manual_clients")?;
    let manual_clients = stmt
        .query_map([], |row| {
            Ok(BackupManualClient {
                email: row.get(0)?,
                name: row.get(1)?,
                created_ts: row.get(2)?,
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
        client_aliases,
        client_billing,
        manual_clients,
        settings,
    })
}

pub fn import_backup(conn: &mut Connection, backup: &Backup) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM events", [])?;
    tx.execute("DELETE FROM event_clients", [])?;
    tx.execute("DELETE FROM client_rate_history", [])?;
    tx.execute("DELETE FROM client_names", [])?;
    tx.execute("DELETE FROM client_aliases", [])?;
    tx.execute("DELETE FROM client_billing", [])?;
    tx.execute("DELETE FROM manual_clients", [])?;
    tx.execute("DELETE FROM settings WHERE key != 'client_secret'", [])?;

    for event in &backup.events {
        tx.execute(
            "INSERT INTO events (id, calendar_id, summary, start_ts, end_ts, status, duration_min,
                                 updated_ts, accepted, discarded, stale, start_local,
                                 include_cancelled)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
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
                event.start_local,
                event.include_cancelled
            ],
        )?;
    }

    for client in &backup.event_clients {
        tx.execute(
            "INSERT OR REPLACE INTO event_clients
                 (event_id, email, name, rsvp, billable, override_rate)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                client.event_id,
                client.email,
                client.name,
                client.rsvp,
                client.billable,
                client.override_rate
            ],
        )?;
    }

    for alias in &backup.client_aliases {
        tx.execute(
            "INSERT OR REPLACE INTO client_aliases (email, client_email) VALUES (?1, ?2)",
            params![alias.email, alias.client_email],
        )?;
    }

    for billing in &backup.client_billing {
        tx.execute(
            "INSERT OR REPLACE INTO client_billing (email, legal_name, tax_id, address)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                billing.email,
                billing.legal_name,
                billing.tax_id,
                billing.address
            ],
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

    for client in &backup.manual_clients {
        tx.execute(
            "INSERT OR REPLACE INTO manual_clients (email, name, created_ts)
             VALUES (?1, ?2, ?3)",
            params![client.email, client.name, client.created_ts],
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
    event_ids: &[String],
) -> rusqlite::Result<i64> {
    let tx = conn.unchecked_transaction()?;
    tx.execute(
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
    let id = tx.last_insert_rowid();
    {
        let mut stmt = tx.prepare(
            "INSERT OR IGNORE INTO invoice_events (invoice_id, event_id) VALUES (?1, ?2)",
        )?;
        for event_id in event_ids {
            stmt.execute(params![id, event_id])?;
        }
    }
    tx.commit()?;
    Ok(id)
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

        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, false).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].classes, 3);
        assert_eq!(client_amount(&rows, "a@x"), 30.0 + 40.0 + DEFAULT);
    }

    #[test]
    fn null_history_rate_falls_back_to_default() {
        let conn = conn();
        set_client_rate(&conn, "b@x", None, "2024-01").unwrap();
        add_event(&conn, "e1", "2024-03-05T10:00:00Z", 1, &[("b@x", "Bruno")]);

        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, false).unwrap();
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

        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, false).unwrap();
        assert_eq!(client_amount(&rows, "a@x"), SHARED);
        assert_eq!(client_amount(&rows, "b@x"), SHARED);

        let groups = list_classes(&conn, FROM, TO, DEFAULT, SHARED).unwrap();
        assert_eq!(groups.len(), 1);
        assert!(groups[0].shared);
        assert_eq!(groups[0].clients.len(), 2);
        assert_eq!(groups[0].total_amount, SHARED * 2.0);
    }

    #[test]
    fn billing_override_excludes_invited_parent_and_survives_resync() {
        let mut conn = conn();
        add_event(
            &conn,
            "e1",
            "2024-03-05T10:00:00Z",
            1,
            &[("a@x", "Ana"), ("padre@x", "Padre")],
        );

        let groups = list_classes(&conn, FROM, TO, DEFAULT, SHARED).unwrap();
        assert!(groups[0].shared);
        assert_eq!(groups[0].total_amount, SHARED * 2.0);

        // El padre está invitado pero la clase es solo con Ana.
        let changed = set_event_billable_clients(&conn, "e1", &["a@x".to_string()]).unwrap();
        assert_eq!(changed, 1);

        let groups = list_classes(&conn, FROM, TO, DEFAULT, SHARED).unwrap();
        assert!(!groups[0].shared);
        assert_eq!(groups[0].clients.len(), 2);
        assert_eq!(groups[0].total_amount, DEFAULT);
        let parent = groups[0]
            .clients
            .iter()
            .find(|client| client.email == "padre@x")
            .unwrap();
        assert!(!parent.billable);
        assert_eq!(parent.amount, 0.0);

        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, false).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(client_amount(&rows, "a@x"), DEFAULT);

        // Una reimportación de Google conserva la exclusión manual.
        let event = EventRow {
            id: "e1".to_string(),
            calendar_id: "primary".to_string(),
            summary: Some("Clase".to_string()),
            start_ts: "2024-03-05T10:00:00Z".to_string(),
            start_local: Some("2024-03-05T10:00:00".to_string()),
            end_ts: "2024-03-05T11:00:00Z".to_string(),
            status: "confirmed".to_string(),
            duration_min: Some(60),
            updated_ts: None,
            clients: vec![
                ClientRef {
                    email: "a@x".to_string(),
                    name: Some("Ana".to_string()),
                    rsvp: Some("accepted".to_string()),
                },
                ClientRef {
                    email: "padre@x".to_string(),
                    name: Some("Padre".to_string()),
                    rsvp: Some("accepted".to_string()),
                },
            ],
        };
        upsert_event(&mut conn, &event).unwrap();
        let groups = list_classes(&conn, FROM, TO, DEFAULT, SHARED).unwrap();
        assert!(!groups[0].shared);
        assert_eq!(groups[0].total_amount, DEFAULT);
    }

    #[test]
    fn cancelled_events_only_count_when_included() {
        let conn = conn();
        add_event(&conn, "e1", "2024-03-05T10:00:00Z", 1, &[("a@x", "Ana")]);
        conn.execute("UPDATE events SET status = 'cancelled' WHERE id = 'e1'", [])
            .unwrap();

        // Por defecto se importa y se ve, pero no computa.
        assert!(
            income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, false)
                .unwrap()
                .is_empty()
        );
        let groups = list_classes(&conn, FROM, TO, DEFAULT, SHARED).unwrap();
        assert!(groups[0].cancelled);
        assert!(!groups[0].included);

        set_event_cancelled_included(&conn, "e1", true).unwrap();
        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, false).unwrap();
        assert_eq!(client_amount(&rows, "a@x"), DEFAULT);
        assert!(list_classes(&conn, FROM, TO, DEFAULT, SHARED).unwrap()[0].included);

        set_event_cancelled_included(&conn, "e1", false).unwrap();
        assert!(
            income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, false)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn cancelled_event_is_imported_as_reviewed_and_keeps_include_choice() {
        let mut conn = conn();
        let event = EventRow {
            id: "e1".to_string(),
            calendar_id: "primary".to_string(),
            summary: Some("Clase cancelada".to_string()),
            start_ts: "2024-03-05T10:00:00Z".to_string(),
            start_local: Some("2024-03-05T10:00:00".to_string()),
            end_ts: "2024-03-05T11:00:00Z".to_string(),
            status: "cancelled".to_string(),
            duration_min: Some(60),
            updated_ts: None,
            clients: vec![ClientRef {
                email: "a@x".to_string(),
                name: Some("Ana".to_string()),
                rsvp: Some("accepted".to_string()),
            }],
        };
        upsert_event(&mut conn, &event).unwrap();

        // No queda pendiente de aceptar, pero tampoco cuenta hasta incluirla.
        assert_eq!(pending_count(&conn).unwrap(), 0);
        let groups = list_classes(&conn, FROM, TO, DEFAULT, SHARED).unwrap();
        assert!(groups[0].cancelled);
        assert!(groups[0].accepted);
        assert!(!groups[0].included);

        set_event_cancelled_included(&conn, "e1", true).unwrap();
        upsert_event(&mut conn, &event).unwrap();
        assert!(list_classes(&conn, FROM, TO, DEFAULT, SHARED).unwrap()[0].included);
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

        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, false).unwrap();
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

        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, false).unwrap();
        assert_eq!(rows[0].classes, 1);

        let changed = set_events_review(&mut conn, &ids, "pending").unwrap();
        assert_eq!(changed, 1);
        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, false).unwrap();
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
        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, false).unwrap();
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
                bank_account: None,
            },
            client: InvoiceClient {
                name: "Bruno".to_string(),
                email: "bruno@x".to_string(),
                tax_id: None,
                address: None,
            },
            lines: vec![InvoiceLine {
                date: "2026-01-05T10:00:00Z".to_string(),
                concept: "Clase".to_string(),
                duration_min: Some(60),
                rate: 30.0,
                amount: 30.0,
                event_id: Some("e1".to_string()),
            }],
            total: 30.0,
        };

        let id = insert_invoice(
            &conn,
            "2026",
            1,
            "2026-02-01T10:00:00Z",
            &data,
            &["e1".to_string()],
        )
        .unwrap();
        assert_eq!(next_invoice_number(&conn, "2026").unwrap(), 2);
        assert_eq!(next_invoice_number(&conn, "2025").unwrap(), 1);

        let list = list_invoices(&conn).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].number, "2026-0001");
        assert_eq!(list[0].client_name, "Bruno");
        assert_eq!(list[0].total, 30.0);

        let linked: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM invoice_events WHERE invoice_id = ?1 AND event_id = 'e1'",
                params![id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(linked, 1);

        let back = get_invoice_data(&conn, id).unwrap().unwrap();
        assert_eq!(back.number, "2026-0001");
        assert_eq!(back.lines.len(), 1);
        assert_eq!(back.issuer.tax_id, "12345678A");
    }

    fn simple_invoice(client_email: &str, date: &str) -> InvoiceData {
        use crate::models::{InvoiceClient, InvoiceIssuer};
        InvoiceData {
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
                bank_account: None,
            },
            client: InvoiceClient {
                name: "Cliente".to_string(),
                email: client_email.to_string(),
                tax_id: None,
                address: None,
            },
            lines: vec![crate::models::InvoiceLine {
                date: date.to_string(),
                concept: "Clase".to_string(),
                duration_min: Some(60),
                rate: 30.0,
                amount: 30.0,
                event_id: None,
            }],
            total: 30.0,
        }
    }

    #[test]
    fn class_detail_reports_the_invoice_that_includes_each_class() {
        let conn = conn();
        add_event(&conn, "e1", "2026-01-05T10:00:00Z", 1, &[("a@x", "Ana")]);
        let data = simple_invoice("a@x", "2026-01-05T10:00:00Z");
        let id = insert_invoice(
            &conn,
            "2026",
            1,
            "2026-02-01T10:00:00Z",
            &data,
            &["e1".to_string()],
        )
        .unwrap();

        let rows = class_detail(&conn, FROM, TO, Some("a@x"), DEFAULT, SHARED).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].invoice_id, Some(id));
        assert_eq!(rows[0].invoice_number.as_deref(), Some("2026-0001"));

        // Otro cliente de una clase compartida sigue sin factura propia.
        let other = class_detail(&conn, FROM, TO, Some("b@x"), DEFAULT, SHARED).unwrap();
        assert!(other.is_empty());
    }

    #[test]
    fn backfill_links_old_invoices_only_when_the_day_is_unambiguous() {
        let first = conn();
        add_event(&first, "e1", "2026-01-05T10:00:00Z", 1, &[("a@x", "Ana")]);
        let data = simple_invoice("a@x", "2026-01-05T10:00:00Z");
        let id = insert_invoice(&first, "2026", 1, "2026-02-01T10:00:00Z", &data, &[]).unwrap();

        backfill_invoice_events(&first).unwrap();
        let links: i64 = first
            .query_row(
                "SELECT COUNT(*) FROM invoice_events WHERE invoice_id = ?1",
                params![id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(links, 1);

        // Dos clases el mismo día: no se puede deducir cuál es, así que no se enlaza.
        let conn2 = conn();
        add_event(&conn2, "e1", "2026-01-05T10:00:00Z", 1, &[("a@x", "Ana")]);
        add_event(&conn2, "e2", "2026-01-05T16:00:00Z", 1, &[("a@x", "Ana")]);
        let data = simple_invoice("a@x", "2026-01-05T10:00:00Z");
        let id = insert_invoice(&conn2, "2026", 1, "2026-02-01T10:00:00Z", &data, &[]).unwrap();
        backfill_invoice_events(&conn2).unwrap();
        let links: i64 = conn2
            .query_row(
                "SELECT COUNT(*) FROM invoice_events WHERE invoice_id = ?1",
                params![id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(links, 0);
    }

    #[test]
    fn manual_clients_are_listed_and_group_the_emails_linked_to_them() {
        let conn = conn();
        add_event(&conn, "e1", "2024-03-05T10:00:00Z", 1, &[("ana@x", "Ana")]);

        let key = create_manual_client(
            &conn,
            "Acme S.L.",
            Some("Facturas@Acme.com"),
            "2024-01-01T00:00:00Z",
        )
        .unwrap();
        assert_eq!(key, "facturas@acme.com");

        let clients = list_clients(&conn).unwrap();
        let acme = clients.iter().find(|row| row.email == key).unwrap();
        assert_eq!(acme.name, "Acme S.L.");

        // Con `include_manual` aparece aunque no tenga clases; sin él, no.
        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, true).unwrap();
        let row = rows.iter().find(|row| row.email == key).unwrap();
        assert!(row.manual);
        assert_eq!(row.classes, 0);
        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, false).unwrap();
        assert!(rows.iter().all(|row| row.email != key));

        // Al vincular el email de una alumna, su clase pasa a ser de la empresa
        // y se sigue mostrando el nombre de la empresa (no el de la alumna).
        link_client_alias(&conn, "ana@x", &key).unwrap();
        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, true).unwrap();
        let row = rows.iter().find(|row| row.email == key).unwrap();
        assert_eq!(row.classes, 1);
        assert_eq!(row.amount, DEFAULT);
        assert_eq!(row.name, "Acme S.L.");
        assert_eq!(rows.len(), 1);

        // No se puede borrar mientras tenga emails vinculados.
        assert!(delete_manual_client(&conn, &key).is_err());
        unlink_client_alias(&conn, "ana@x").unwrap();
        delete_manual_client(&conn, &key).unwrap();
        assert!(list_clients(&conn)
            .unwrap()
            .iter()
            .all(|row| row.email != key));
    }

    #[test]
    fn manual_client_without_email_gets_an_internal_unique_key() {
        let conn = conn();
        add_event(&conn, "e1", "2024-03-05T10:00:00Z", 1, &[("ana@x", "Ana")]);
        let first =
            create_manual_client(&conn, "Clases Particulares", None, "2024-01-01T00:00:00Z")
                .unwrap();
        let second =
            create_manual_client(&conn, "Clases Particulares", None, "2024-01-01T00:00:00Z")
                .unwrap();
        assert_eq!(first, "manual-clases-particulares");
        assert_eq!(second, "manual-clases-particulares-2");

        // Cualquier clave repetida (manual, invitado o vinculada) se rechaza.
        assert!(
            create_manual_client(&conn, "Otra", Some("ana@x"), "2024-01-01T00:00:00Z").is_err()
        );
        assert!(create_manual_client(&conn, "Otra", Some(&first), "2024-01-01T00:00:00Z").is_err());
        assert!(create_manual_client(&conn, "  ", None, "2024-01-01T00:00:00Z").is_err());
        assert!(
            create_manual_client(&conn, "Sin arroba", Some("nope"), "2024-01-01T00:00:00Z")
                .is_err()
        );
    }

    #[test]
    fn manual_rate_overrides_automatic_rates_and_survives_resync() {
        let mut conn = conn();
        add_event(
            &conn,
            "e1",
            "2024-03-05T10:00:00Z",
            1,
            &[("a@x", "Ana"), ("b@x", "Bruno")],
        );

        set_event_client_rate(&conn, "e1", "a@x", Some(7.5)).unwrap();
        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, false).unwrap();
        assert_eq!(client_amount(&rows, "a@x"), 7.5);
        assert_eq!(client_amount(&rows, "b@x"), SHARED);

        let groups = list_classes(&conn, FROM, TO, DEFAULT, SHARED).unwrap();
        let ana = groups[0].clients.iter().find(|c| c.email == "a@x").unwrap();
        assert_eq!(ana.amount, 7.5);
        assert_eq!(groups[0].total_amount, 7.5 + SHARED);

        let detail = class_detail(&conn, FROM, TO, Some("a@x"), DEFAULT, SHARED).unwrap();
        assert_eq!(detail.len(), 1);
        assert_eq!(detail[0].amount, 7.5);
        assert!(detail[0].overridden);

        // La reimportación conserva el importe manual.
        let event = EventRow {
            id: "e1".to_string(),
            calendar_id: "primary".to_string(),
            summary: Some("Clase".to_string()),
            start_ts: "2024-03-05T10:00:00Z".to_string(),
            start_local: Some("2024-03-05T10:00:00".to_string()),
            end_ts: "2024-03-05T11:00:00Z".to_string(),
            status: "confirmed".to_string(),
            duration_min: Some(60),
            updated_ts: None,
            clients: vec![
                ClientRef {
                    email: "a@x".to_string(),
                    name: Some("Ana".to_string()),
                    rsvp: Some("accepted".to_string()),
                },
                ClientRef {
                    email: "b@x".to_string(),
                    name: Some("Bruno".to_string()),
                    rsvp: Some("accepted".to_string()),
                },
            ],
        };
        upsert_event(&mut conn, &event).unwrap();
        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, false).unwrap();
        assert_eq!(client_amount(&rows, "a@x"), 7.5);

        // Quitar la tarifa manual vuelve a la tarifa compartida.
        set_event_client_rate(&conn, "e1", "a@x", None).unwrap();
        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, false).unwrap();
        assert_eq!(client_amount(&rows, "a@x"), SHARED);
    }

    #[test]
    fn manual_rate_is_hourly_and_scales_with_duration() {
        let conn = conn();
        add_event(&conn, "e1", "2024-03-05T10:00:00Z", 1, &[("a@x", "Ana")]);
        // Clase de 90 minutos con una tarifa especial de 20 €/hora.
        conn.execute("UPDATE events SET duration_min = 90 WHERE id = 'e1'", [])
            .unwrap();

        set_event_client_rate(&conn, "e1", "a@x", Some(20.0)).unwrap();
        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, false).unwrap();
        assert_eq!(client_amount(&rows, "a@x"), 30.0);

        let detail = class_detail(&conn, FROM, TO, Some("a@x"), DEFAULT, SHARED).unwrap();
        assert_eq!(detail[0].rate, 20.0);
        assert_eq!(detail[0].amount, 30.0);

        let groups = list_classes(&conn, FROM, TO, DEFAULT, SHARED).unwrap();
        assert_eq!(groups[0].clients[0].amount, 30.0);
    }

    #[test]
    fn client_billing_round_trips() {
        let conn = conn();
        let empty = get_client_billing(&conn, "a@x").unwrap();
        assert_eq!(empty.legal_name, "");
        assert_eq!(empty.tax_id, "");

        set_client_billing(
            &conn,
            "a@x",
            &ClientBilling {
                legal_name: "Empresa SL".to_string(),
                tax_id: "B12345678".to_string(),
                address: "Calle Mayor 1".to_string(),
            },
        )
        .unwrap();

        let billing = get_client_billing(&conn, "A@X").unwrap();
        assert_eq!(billing.legal_name, "Empresa SL");
        assert_eq!(billing.tax_id, "B12345678");
        assert_eq!(billing.address, "Calle Mayor 1");
    }

    #[test]
    fn linked_emails_are_grouped_under_one_client() {
        let conn = conn();
        add_event(&conn, "e1", "2024-03-05T10:00:00Z", 1, &[("ana@x", "Ana")]);
        add_event(
            &conn,
            "e2",
            "2024-03-12T10:00:00Z",
            1,
            &[("empresa@x", "Empresa")],
        );

        // Sin vínculo son dos clientes.
        assert_eq!(
            income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, false)
                .unwrap()
                .len(),
            2
        );

        link_client_alias(&conn, "empresa@x", "ana@x").unwrap();
        let aliases = list_client_aliases(&conn).unwrap();
        assert_eq!(aliases.len(), 1);
        assert_eq!(aliases[0].client_email, "ana@x");

        let rows = income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, false).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].email, "ana@x");
        assert_eq!(rows[0].classes, 2);
        assert_eq!(rows[0].amount, DEFAULT * 2.0);

        let clients = list_clients(&conn).unwrap();
        assert_eq!(clients.len(), 1);
        assert_eq!(clients[0].email, "ana@x");

        // El detalle por cliente incluye las clases de ambos emails.
        let detail = class_detail(&conn, FROM, TO, Some("ana@x"), DEFAULT, SHARED).unwrap();
        assert_eq!(detail.len(), 2);

        // Se puede separar de nuevo.
        unlink_client_alias(&conn, "empresa@x").unwrap();
        assert_eq!(
            income_by_client(&conn, FROM, TO, None, DEFAULT, SHARED, false)
                .unwrap()
                .len(),
            2
        );
    }

    #[test]
    fn clear_all_data_keeps_settings() {
        let conn = conn();
        add_event(&conn, "e1", "2024-03-05T10:00:00Z", 1, &[("a@x", "Ana")]);
        set_client_name(&conn, "a@x", Some("Ana")).unwrap();
        set_client_rate(&conn, "a@x", Some(25.0), "2024-01").unwrap();
        link_client_alias(&conn, "b@x", "a@x").unwrap();
        set_setting(&conn, "default_rate", "30").unwrap();

        clear_all_data(&conn).unwrap();

        let events: i64 = conn
            .query_row("SELECT COUNT(*) FROM events", [], |row| row.get(0))
            .unwrap();
        let clients: i64 = conn
            .query_row("SELECT COUNT(*) FROM client_names", [], |row| row.get(0))
            .unwrap();
        let aliases: i64 = conn
            .query_row("SELECT COUNT(*) FROM client_aliases", [], |row| row.get(0))
            .unwrap();
        assert_eq!(events, 0);
        assert_eq!(clients, 0);
        assert_eq!(aliases, 0);
        assert_eq!(get_setting(&conn, "default_rate").as_deref(), Some("30"));
    }
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientRef {
    pub email: String,
    pub name: Option<String>,
    pub rsvp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventRow {
    pub id: String,
    pub calendar_id: String,
    pub summary: Option<String>,
    /// Inicio en UTC (RFC 3339). Se usa para ordenar y para el rango de Google.
    pub start_ts: String,
    /// Inicio en la zona horaria del calendario de Google (fecha/hora local sin
    /// offset, `YYYY-MM-DDTHH:MM:SS`). Es lo que se usa para imputar la clase al
    /// mes/día correctos y para mostrarla en facturas y CSV.
    pub start_local: Option<String>,
    pub end_ts: String,
    pub status: String,
    pub duration_min: Option<i64>,
    pub updated_ts: Option<String>,
    pub clients: Vec<ClientRef>,
}

#[derive(Debug, Serialize)]
pub struct CalendarEntry {
    pub id: String,
    pub summary: String,
    pub primary: bool,
    pub selected: bool,
    pub access_role: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SyncSummary {
    pub fetched: usize,
    pub classes: usize,
    pub calendars: usize,
    /// Clases que ya existían en la BD y han dejado de aparecer en Google
    /// (borradas, canceladas o que ya no cualifican) tras esta importación.
    pub stale: usize,
    /// Clases que estaban marcadas como no presentes y han vuelto a aparecer.
    pub restored: usize,
    pub last_sync: String,
}

#[derive(Debug, Serialize)]
pub struct ClassDetail {
    pub id: String,
    pub summary: Option<String>,
    pub start_ts: String,
    /// Inicio local (`YYYY-MM-DDTHH:MM:SS`) del calendario; fecha correcta para
    /// facturas y CSV. Igual a `start_ts` si el evento no traía zona horaria.
    pub start_local: String,
    pub end_ts: String,
    pub duration_min: Option<i64>,
    pub email: String,
    pub name: String,
    pub rate: f64,
    pub amount: f64,
}

#[derive(Debug, Serialize)]
pub struct AppStatus {
    pub has_credentials: bool,
    pub connected: bool,
    pub email: Option<String>,
    pub last_sync: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct GoogleCredentials {
    pub client_id: Option<String>,
    pub has_secret: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RatesConfig {
    pub default_rate: f64,
    pub shared_rate: f64,
    pub currency: String,
}

#[derive(Debug, Serialize)]
pub struct ClientIncome {
    pub email: String,
    pub name: String,
    pub classes: i64,
    pub amount: f64,
    pub rate: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct MonthlyIncome {
    pub month: String,
    pub classes: i64,
    pub amount: f64,
}

#[derive(Debug, Serialize)]
pub struct ClassClient {
    pub email: String,
    pub name: String,
    pub amount: f64,
}

#[derive(Debug, Serialize)]
pub struct ClassGroup {
    pub id: String,
    pub summary: Option<String>,
    pub start_ts: String,
    /// Inicio local (`YYYY-MM-DDTHH:MM:SS`); fecha correcta para el CSV.
    pub start_local: String,
    pub end_ts: String,
    pub duration_min: Option<i64>,
    pub shared: bool,
    pub accepted: bool,
    pub discarded: bool,
    /// La clase ya no aparece en Google (o dejó de cualificar) desde la última
    /// importación: se muestra en Importación pero no cuenta en el Histórico.
    pub stale: bool,
    pub total_amount: f64,
    pub clients: Vec<ClassClient>,
}

#[derive(Debug, Serialize)]
pub struct ClientEntry {
    pub email: String,
    pub name: String,
    pub rate: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupEvent {
    pub id: String,
    pub calendar_id: String,
    pub summary: Option<String>,
    pub start_ts: String,
    /// Copias antiguas no incluyen este campo.
    #[serde(default)]
    pub start_local: Option<String>,
    pub end_ts: String,
    pub status: String,
    pub duration_min: Option<i64>,
    pub updated_ts: Option<String>,
    pub accepted: i64,
    pub discarded: i64,
    /// Copias antiguas no incluyen este campo; por defecto 0.
    #[serde(default)]
    pub stale: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupClient {
    pub event_id: String,
    pub email: String,
    pub name: Option<String>,
    pub rsvp: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupRate {
    pub email: String,
    pub effective_from: String,
    pub rate: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupName {
    pub email: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupSetting {
    pub key: String,
    pub value: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Backup {
    pub version: u32,
    pub exported_at: String,
    pub events: Vec<BackupEvent>,
    pub event_clients: Vec<BackupClient>,
    pub client_rate_history: Vec<BackupRate>,
    pub client_names: Vec<BackupName>,
    pub settings: Vec<BackupSetting>,
}

#[derive(Debug, Serialize)]
pub struct RateHistoryEntry {
    pub effective_from: String,
    pub rate: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct BackupSummary {
    pub file: String,
    pub events: usize,
    pub clients: usize,
    pub rates: usize,
    pub names: usize,
    pub settings: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceIssuer {
    pub name: String,
    pub tax_id: String,
    pub address: String,
    pub email: String,
    pub phone: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceClient {
    pub name: String,
    pub email: String,
    pub tax_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceLine {
    /// RFC 3339 UTC del inicio de la clase.
    pub date: String,
    pub concept: String,
    pub duration_min: Option<i64>,
    pub rate: f64,
    pub amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceData {
    pub number: String,
    pub issued_on: String,
    pub period: String,
    pub currency: String,
    pub issuer: InvoiceIssuer,
    pub client: InvoiceClient,
    pub lines: Vec<InvoiceLine>,
    pub total: f64,
}

#[derive(Debug, Serialize)]
pub struct InvoicePreview {
    pub number: String,
    pub period: String,
    pub currency: String,
    pub client: InvoiceClient,
    pub lines: Vec<InvoiceLine>,
    pub total: f64,
}

#[derive(Debug, Serialize)]
pub struct InvoiceRecord {
    pub id: i64,
    pub number: String,
    pub issued_on: String,
    pub period: String,
    pub client_name: String,
    pub client_email: String,
    pub total: f64,
    pub currency: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InvoiceSettings {
    pub name: String,
    pub tax_id: String,
    pub address: String,
    pub email: String,
    pub phone: String,
}

#[derive(Debug, Serialize)]
pub struct InvoiceIssued {
    pub id: i64,
    pub number: String,
    pub file: String,
}

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
    pub start_ts: String,
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
    pub last_sync: String,
}

#[derive(Debug, Serialize)]
pub struct MonthlyStat {
    pub month: String,
    pub classes: i64,
}

#[derive(Debug, Serialize)]
pub struct ClientStat {
    pub email: String,
    pub name: String,
    pub classes: i64,
}

#[derive(Debug, Serialize)]
pub struct ClassDetail {
    pub id: String,
    pub summary: Option<String>,
    pub start_ts: String,
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
    pub selected_calendars: Vec<String>,
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
    pub minutes: i64,
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
    pub end_ts: String,
    pub duration_min: Option<i64>,
    pub shared: bool,
    pub accepted: bool,
    pub discarded: bool,
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
    pub end_ts: String,
    pub status: String,
    pub duration_min: Option<i64>,
    pub updated_ts: Option<String>,
    pub accepted: i64,
    pub discarded: i64,
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

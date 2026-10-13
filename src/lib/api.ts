import { invoke } from "@tauri-apps/api/core";

export interface AppStatus {
  has_credentials: boolean;
  connected: boolean;
  email: string | null;
  last_sync: string | null;
  selected_calendars: string[];
}

export interface GoogleCredentials {
  client_id: string | null;
  has_secret: boolean;
}

export interface CalendarEntry {
  id: string;
  summary: string;
  primary: boolean;
  selected: boolean;
  access_role: string | null;
}

export interface SyncSummary {
  fetched: number;
  classes: number;
  calendars: number;
  last_sync: string;
}

export interface MonthlyStat {
  month: string;
  classes: number;
}

export interface ClientStat {
  email: string;
  name: string;
  classes: number;
}

export interface ClassDetail {
  id: string;
  summary: string | null;
  start_ts: string;
  end_ts: string;
  duration_min: number | null;
  email: string;
  name: string;
}

export interface RatesConfig {
  mode: string;
  default_rate: number;
  shared_rate: number;
  currency: string;
}

export interface ClientIncome {
  email: string;
  name: string;
  classes: number;
  minutes: number;
  amount: number;
  rate: number | null;
}

export interface MonthlyIncome {
  month: string;
  classes: number;
  amount: number;
}

export interface ClassClient {
  email: string;
  name: string;
  amount: number;
}

export interface ClassGroup {
  id: string;
  summary: string | null;
  start_ts: string;
  end_ts: string;
  duration_min: number | null;
  shared: boolean;
  accepted: boolean;
  discarded: boolean;
  total_amount: number;
  clients: ClassClient[];
}

export interface ClientEntry {
  email: string;
  name: string;
  rate: number | null;
}

export const api = {
  getStatus: () => invoke<AppStatus>("get_status"),
  getGoogleCredentials: () => invoke<GoogleCredentials>("get_google_credentials"),
  setGoogleCredentials: (clientId: string, clientSecret: string) =>
    invoke<void>("set_google_credentials", { clientId, clientSecret }),
  connectGoogle: () => invoke<string>("connect_google"),
  disconnectGoogle: () => invoke<void>("disconnect_google"),
  listCalendars: () => invoke<CalendarEntry[]>("list_calendars"),
  setSelectedCalendars: (ids: string[]) =>
    invoke<void>("set_selected_calendars", { ids }),
  syncEvents: (calendarIds: string[], from: string, to: string) =>
    invoke<SyncSummary>("sync_events", { calendarIds, from, to }),
  monthlyStats: (from: string, to: string) =>
    invoke<MonthlyStat[]>("monthly_stats", { from, to }),
  clientStats: (from: string, to: string, month: string | null) =>
    invoke<ClientStat[]>("client_stats", { from, to, month }),
  classDetail: (from: string, to: string, email: string | null) =>
    invoke<ClassDetail[]>("class_detail", { from, to, email }),
  exportCsv: (from: string, to: string, email: string | null) =>
    invoke<string>("export_csv", { from, to, email }),
  getRatesConfig: () => invoke<RatesConfig>("get_rates_config"),
  setRatesConfig: (mode: string, defaultRate: number, sharedRate: number, currency: string) =>
    invoke<void>("set_rates_config", { mode, defaultRate, sharedRate, currency }),
  setClientRate: (email: string, rate: number | null) =>
    invoke<void>("set_client_rate", { email, rate }),
  incomeByClient: (from: string, to: string, month: string | null) =>
    invoke<ClientIncome[]>("income_by_client", { from, to, month }),
  incomeByMonth: (from: string, to: string) =>
    invoke<MonthlyIncome[]>("income_by_month", { from, to }),
  listClasses: (from: string, to: string) =>
    invoke<ClassGroup[]>("list_classes", { from, to }),
  acceptImport: (from: string, to: string) =>
    invoke<number>("accept_import", { from, to }),
  setEventReview: (id: string, review: string) =>
    invoke<void>("set_event_review", { id, review }),
  listClients: () => invoke<ClientEntry[]>("list_clients"),
  setClientName: (email: string, name: string | null) =>
    invoke<void>("set_client_name", { email, name }),
  getSettingValue: (key: string) => invoke<string | null>("get_setting_value", { key }),
  setSettingValue: (key: string, value: string) =>
    invoke<void>("set_setting_value", { key, value }),
  latestEventMonth: () => invoke<string | null>("latest_event_month"),
};

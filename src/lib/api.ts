import { invoke } from "@tauri-apps/api/core";

function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(cmd, args).catch((error) => {
    if (String(error).includes("REAUTH_REQUIRED")) {
      window.dispatchEvent(new CustomEvent("facturita:reauth"));
    }
    throw error;
  });
}

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
  rate: number;
  amount: number;
}

export interface RatesConfig {
  mode: string;
  default_rate: number;
  shared_rate: number;
  currency: string;
}

export interface RateHistoryEntry {
  effective_from: string;
  rate: number | null;
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

export interface BackupSummary {
  file: string;
  events: number;
  clients: number;
  rates: number;
  names: number;
  settings: number;
}

export const api = {
  getStatus: () => call<AppStatus>("get_status"),
  getGoogleCredentials: () => call<GoogleCredentials>("get_google_credentials"),
  setGoogleCredentials: (clientId: string, clientSecret: string) =>
    call<void>("set_google_credentials", { clientId, clientSecret }),
  connectGoogle: () => call<string>("connect_google"),
  disconnectGoogle: () => call<void>("disconnect_google"),
  listCalendars: () => call<CalendarEntry[]>("list_calendars"),
  setSelectedCalendars: (ids: string[]) =>
    call<void>("set_selected_calendars", { ids }),
  syncEvents: (calendarIds: string[], from: string, to: string) =>
    call<SyncSummary>("sync_events", { calendarIds, from, to }),
  monthlyStats: (from: string, to: string) =>
    call<MonthlyStat[]>("monthly_stats", { from, to }),
  clientStats: (from: string, to: string, month: string | null) =>
    call<ClientStat[]>("client_stats", { from, to, month }),
  classDetail: (from: string, to: string, email: string | null) =>
    call<ClassDetail[]>("class_detail", { from, to, email }),
  exportCsv: (from: string, to: string, email: string | null) =>
    call<string>("export_csv", { from, to, email }),
  getRatesConfig: () => call<RatesConfig>("get_rates_config"),
  setRatesConfig: (mode: string, defaultRate: number, sharedRate: number, currency: string) =>
    call<void>("set_rates_config", { mode, defaultRate, sharedRate, currency }),
  setClientRate: (email: string, rate: number | null, effectiveFrom?: string) =>
    call<void>("set_client_rate", { email, rate, effectiveFrom: effectiveFrom ?? null }),
  updateClientRate: (
    email: string,
    oldEffectiveFrom: string,
    newEffectiveFrom: string,
    rate: number | null,
  ) =>
    call<void>("update_client_rate", {
      email,
      oldEffectiveFrom,
      newEffectiveFrom,
      rate,
    }),
  deleteClientRate: (email: string, effectiveFrom: string) =>
    call<void>("delete_client_rate", { email, effectiveFrom }),
  clientRateHistory: (email: string) =>
    call<RateHistoryEntry[]>("client_rate_history", { email }),
  incomeByClient: (from: string, to: string, month: string | null) =>
    call<ClientIncome[]>("income_by_client", { from, to, month }),
  incomeByMonth: (from: string, to: string) =>
    call<MonthlyIncome[]>("income_by_month", { from, to }),
  listClasses: (from: string, to: string) =>
    call<ClassGroup[]>("list_classes", { from, to }),
  acceptImport: (from: string, to: string) =>
    call<number>("accept_import", { from, to }),
  setEventReview: (id: string, review: string) =>
    call<void>("set_event_review", { id, review }),
  setEventsReview: (ids: string[], review: string) =>
    call<number>("set_events_review", { ids, review }),
  pendingCount: () => call<number>("pending_count"),
  listClients: () => call<ClientEntry[]>("list_clients"),
  setClientName: (email: string, name: string | null) =>
    call<void>("set_client_name", { email, name }),
  getSettingValue: (key: string) => call<string | null>("get_setting_value", { key }),
  setSettingValue: (key: string, value: string) =>
    call<void>("set_setting_value", { key, value }),
  latestEventMonth: () => call<string | null>("latest_event_month"),
  exportBackup: () => call<string | null>("export_backup"),
  importBackup: () => call<BackupSummary | null>("import_backup"),
};

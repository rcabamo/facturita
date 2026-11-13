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
  /** Clases que han dejado de aparecer en Google tras esta importación. */
  stale: number;
  /** Clases marcadas como ausentes que han vuelto a aparecer. */
  restored: number;
  /** Eventos cancelados en Google importados para revisarlos. */
  cancelled: number;
  last_sync: string;
}

export interface ClassDetail {
  id: string;
  /** Nombre visible: el personalizado si lo hay y, si no, el de Google. */
  summary: string | null;
  /** Nombre fijado a mano (`null` = usar el título de Google). */
  custom_summary?: string | null;
  start_ts: string;
  /** Inicio en la zona horaria del calendario (`YYYY-MM-DDTHH:MM:SS`). */
  start_local: string;
  end_ts: string;
  duration_min: number | null;
  email: string;
  name: string;
  rate: number;
  amount: number;
  /** `true` si el importe de esta clase se fijó a mano. */
  overridden?: boolean;
  /** Factura en la que ya se incluyó esta clase (si se facturó). */
  invoice_id?: number | null;
  invoice_number?: string | null;
}

export interface RatesConfig {
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
  amount: number;
  rate: number | null;
  /** `true` si el cliente se ha creado a mano (puede no tener clases). */
  manual?: boolean;
}

export interface ClientAlias {
  email: string;
  client_email: string;
}

/** Email del calendario que se puede vincular a un cliente. */
export interface EmailSuggestion {
  email: string;
  name: string | null;
  /** Cliente al que pertenece ahora mismo. */
  client_email: string;
  client_name: string;
}

/** Datos fiscales del cliente que se muestran en sus facturas. */
export interface ClientBilling {
  legal_name: string;
  tax_id: string;
  address: string;
  /** Idioma del PDF de sus facturas: `es` o `en`. */
  language: string;
}

export interface MonthlyIncome {
  month: string;
  classes: number;
  amount: number;
}

export interface ClassClient {
  email: string;
  /** Email canónico del cliente (agrupa varios emails). */
  client_key?: string;
  name: string;
  amount: number;
  /** `false` si está invitado pero se ha excluido manualmente del cómputo. */
  billable: boolean;
}

export interface ClassGroup {
  id: string;
  /** Nombre visible: el personalizado si lo hay y, si no, el de Google. */
  summary: string | null;
  /** Nombre fijado a mano (`null` = usar el título de Google). */
  custom_summary?: string | null;
  start_ts: string;
  /** Inicio en la zona horaria del calendario (`YYYY-MM-DDTHH:MM:SS`). */
  start_local: string;
  end_ts: string;
  duration_min: number | null;
  shared: boolean;
  accepted: boolean;
  discarded: boolean;
  /** La clase ya no aparece en Google y no cuenta en el Histórico. */
  stale: boolean;
  /** El evento está cancelado en Google. */
  cancelled: boolean;
  /** Solo cancelados: el usuario ha decidido que cuenten. */
  included: boolean;
  total_amount: number;
  clients: ClassClient[];
}

export interface BackupSummary {
  file: string;
  events: number;
  clients: number;
  rates: number;
  names: number;
  invoices: number;
  settings: number;
}

export interface InvoiceClient {
  name: string;
  email: string;
  tax_id: string | null;
  /** Copias antiguas de facturas no incluyen este campo. */
  address: string | null;
}

export interface InvoiceLine {
  date: string;
  concept: string;
  duration_min: number | null;
  rate: number;
  amount: number;
  /** Clase de la que sale la línea (las facturas antiguas no lo guardaban). */
  event_id?: string | null;
}

/** Clase del mes que puede incluirse en una factura. */
export interface InvoiceCandidate {
  event_id: string;
  /** Inicio local (`YYYY-MM-DDTHH:MM:SS`). */
  date: string;
  concept: string;
  duration_min: number | null;
  rate: number;
  amount: number;
  /** Factura que ya incluye esta clase, si la hay. */
  invoice_id: number | null;
  invoice_number: string | null;
}

export interface InvoicePreview {
  number: string;
  period: string;
  currency: string;
  client: InvoiceClient;
  classes: InvoiceCandidate[];
  /** Idioma con el que se emitirá el PDF. */
  lang: string;
  /** Clases del mes pendientes de aceptar (no entran en la factura). */
  pending: number;
}

export interface InvoiceRecord {
  id: number;
  number: string;
  issued_on: string;
  period: string;
  client_name: string;
  client_email: string;
  total: number;
  currency: string;
  /** Fecha de cobro (`YYYY-MM-DD`); `null` = pendiente. */
  paid_on: string | null;
  /** Factura anulada: sus clases vuelven a estar sin facturar. */
  voided: boolean;
  voided_ts: string | null;
}

export interface InvoiceSettings {
  name: string;
  tax_id: string;
  address: string;
  email: string;
  phone: string;
  /** Cuenta bancaria donde se debe hacer el ingreso. */
  bank_account: string;
}

export interface InvoiceIssued {
  id: number;
  number: string;
  file: string;
}

/** Datos completos de una factura guardada. */
export interface InvoiceData {
  number: string;
  issued_on: string;
  period: string;
  currency: string;
  issuer: {
    name: string;
    tax_id: string;
    address: string;
    email: string;
    phone: string | null;
    bank_account: string | null;
  };
  client: InvoiceClient;
  lines: InvoiceLine[];
  total: number;
  /** Idioma del PDF (`es`/`en`); las facturas antiguas no lo guardaban. */
  lang?: string;
}

export const api = {
  getStatus: () => call<AppStatus>("get_status"),
  getGoogleCredentials: () => call<GoogleCredentials>("get_google_credentials"),
  setGoogleCredentials: (clientId: string, clientSecret: string) =>
    call<void>("set_google_credentials", { clientId, clientSecret }),
  connectGoogle: () => call<string>("connect_google"),
  disconnectGoogle: () => call<void>("disconnect_google"),
  listCalendars: () => call<CalendarEntry[]>("list_calendars"),
  setSelectedCalendars: (ids: string[]) => call<void>("set_selected_calendars", { ids }),
  syncEvents: (calendarIds: string[], from: string, to: string) =>
    call<SyncSummary>("sync_events", { calendarIds, from, to }),
  classDetail: (from: string, to: string, email: string | null) =>
    call<ClassDetail[]>("class_detail", { from, to, email }),
  exportCsv: (from: string, to: string, email: string | null) =>
    call<string>("export_csv", { from, to, email }),
  getRatesConfig: () => call<RatesConfig>("get_rates_config"),
  setRatesConfig: (defaultRate: number, sharedRate: number, currency: string) =>
    call<void>("set_rates_config", { defaultRate, sharedRate, currency }),
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
  clientRateHistory: (email: string) => call<RateHistoryEntry[]>("client_rate_history", { email }),
  incomeByClient: (from: string, to: string, month: string | null, includeManual = false) =>
    call<ClientIncome[]>("income_by_client", { from, to, month, includeManual }),
  incomeByMonth: (from: string, to: string) =>
    call<MonthlyIncome[]>("income_by_month", { from, to }),
  listClasses: (from: string, to: string) => call<ClassGroup[]>("list_classes", { from, to }),
  acceptImport: (from: string, to: string) => call<number>("accept_import", { from, to }),
  setEventReview: (id: string, review: string) => call<void>("set_event_review", { id, review }),
  setEventSummary: (id: string, summary: string | null) =>
    call<void>("set_event_summary", { id, summary }),
  setEventBilling: (id: string, emails: string[]) =>
    call<void>("set_event_billing", { id, emails }),
  setEventClientRate: (id: string, email: string, rate: number | null) =>
    call<void>("set_event_client_rate", { id, email, rate }),
  setEventCancelledIncluded: (id: string, included: boolean) =>
    call<void>("set_event_cancelled_included", { id, included }),
  setEventsReview: (ids: string[], review: string) =>
    call<number>("set_events_review", { ids, review }),
  pendingCount: () => call<number>("pending_count"),
  setClientName: (email: string, name: string | null) =>
    call<void>("set_client_name", { email, name }),
  getClientBilling: (email: string) => call<ClientBilling>("client_billing", { email }),
  setClientBilling: (email: string, billing: ClientBilling) =>
    call<void>("set_client_billing", {
      email,
      legalName: billing.legal_name,
      taxId: billing.tax_id,
      address: billing.address,
      language: billing.language,
    }),
  listClientAliases: () => call<ClientAlias[]>("list_client_aliases"),
  linkClientAlias: (email: string, clientEmail: string) =>
    call<void>("link_client_alias", { email, clientEmail }),
  unlinkClientAlias: (email: string) => call<number>("unlink_client_alias", { email }),
  listEmailSuggestions: () => call<EmailSuggestion[]>("list_email_suggestions"),
  createManualClient: (name: string, email: string | null) =>
    call<string>("create_manual_client", { name, email }),
  deleteManualClient: (email: string) => call<void>("delete_manual_client", { email }),
  clearAllData: () => call<void>("clear_all_data"),
  getSettingValue: (key: string) => call<string | null>("get_setting_value", { key }),
  setSettingValue: (key: string, value: string) => call<void>("set_setting_value", { key, value }),
  latestEventMonth: () => call<string | null>("latest_event_month"),
  exportBackup: () => call<string | null>("export_backup"),
  importBackup: () => call<BackupSummary | null>("import_backup"),
  getInvoiceSettings: () => call<InvoiceSettings>("get_invoice_settings"),
  setInvoiceSettings: (settings: InvoiceSettings) =>
    call<void>("set_invoice_settings", {
      name: settings.name,
      taxId: settings.tax_id,
      address: settings.address,
      email: settings.email,
      phone: settings.phone,
      bankAccount: settings.bank_account,
    }),
  previewInvoice: (email: string, month: string) =>
    call<InvoicePreview>("preview_invoice", { email, month }),
  issueInvoice: (email: string, month: string, eventIds: string[]) =>
    call<InvoiceIssued | null>("issue_invoice", { email, month, eventIds }),
  listInvoices: () => call<InvoiceRecord[]>("list_invoices"),
  invoiceDetail: (id: number) => call<InvoiceData>("invoice_detail", { id }),
  setInvoicePaid: (id: number, paid: boolean) => call<void>("set_invoice_paid", { id, paid }),
  voidInvoice: (id: number) => call<void>("void_invoice", { id }),
  removeInvoiceLine: (id: number, eventId: string) =>
    call<void>("remove_invoice_line", { id, eventId }),
  exportSavedInvoice: (id: number) => call<string | null>("export_saved_invoice", { id }),
};

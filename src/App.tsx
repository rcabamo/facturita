import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type AppStatus,
  type CalendarEntry,
  type ClassDetail,
  type ClassGroup,
  type ClientIncome,
  type MonthlyIncome,
  type RatesConfig,
} from "./lib/api";
import {
  MONTH_NAMES,
  firstDayOfMonth,
  formatDate,
  formatDateTime,
  formatMonth,
  formatTimestamp,
  lastDayOfMonth,
  today,
  yearMonthOf,
} from "./lib/dates";
import logo from "./assets/logo.svg";
import { UpdateBanner } from "./components/UpdateBanner";
import "./App.css";

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand compact" : "brand"}>
      <img src={logo} alt="Facturita" className="brand-logo" />
      <div className="brand-text">
        <span className="brand-name">Facturita</span>
        <span className="brand-sub">Clases de inglés · por mes y cliente</span>
      </div>
    </div>
  );
}

function MonthPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (yearMonth: string) => void;
}) {
  const { year, month } = yearMonthOf(value);
  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear + 1; y >= thisYear - 10; y--) {
    years.push(y);
  }

  function set(nextYear: number, nextMonth: number) {
    onChange(`${nextYear}-${String(nextMonth + 1).padStart(2, "0")}`);
  }

  return (
    <div className="month-picker">
      <select
        value={month}
        aria-label="Mes"
        onChange={(e) => set(year, Number(e.target.value))}
      >
        {MONTH_NAMES.map((name, index) => (
          <option key={name} value={index}>
            {name}
          </option>
        ))}
      </select>
      <select
        value={year}
        aria-label="Año"
        onChange={(e) => set(Number(e.target.value), month)}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function endDateForMonth(yearMonth: string): string {
  const { year, month } = yearMonthOf(yearMonth);
  const now = new Date();
  if (year === now.getFullYear() && month === now.getMonth()) {
    return today();
  }
  return lastDayOfMonth(year, month);
}

export default function App() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setStatus(await api.getStatus());
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!status) {
    return (
      <div className="center">
        {error ? <div className="alert error">{error}</div> : <p>Cargando…</p>}
      </div>
    );
  }

  if (!status.has_credentials) {
    return <SetupScreen onDone={reload} />;
  }

  if (!status.connected) {
    return <ConnectScreen onDone={reload} />;
  }

  return <Main status={status} onDisconnect={reload} />;
}

function SetupScreen({ onDone }: { onDone: () => void }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getGoogleCredentials()
      .then((creds) => setClientId(creds.client_id ?? ""))
      .catch(() => undefined);
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.setGoogleCredentials(clientId, clientSecret);
      onDone();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <form className="card form" onSubmit={save}>
        <Brand compact />
        <h1>Configuración inicial</h1>
        <p className="muted">
          Pega las credenciales OAuth de tipo <strong>Aplicación de escritorio</strong> creadas
          en Google Cloud Console (con la API de Google Calendar habilitada).
        </p>
        <label>
          Client ID
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="xxxxx.apps.googleusercontent.com"
            required
          />
        </label>
        <label>
          Client secret
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="GOCSPX-..."
            required
          />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? "Guardando…" : "Guardar credenciales"}
        </button>
      </form>
    </div>
  );
}

function ConnectScreen({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await api.connectGoogle();
      onDone();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <div className="card form">
        <Brand compact />
        <h1>Conecta tu Google Calendar</h1>
        <p className="muted">
          Se abrirá tu navegador para autorizar el acceso de <strong>solo lectura</strong> a tus
          calendarios. Al terminar, vuelve a esta ventana.
        </p>
        {error && <div className="alert error">{error}</div>}
        <button type="button" onClick={connect} disabled={busy}>
          {busy ? "Esperando autorización…" : "Conectar con Google"}
        </button>
      </div>
    </div>
  );
}

function RateInput({
  value,
  placeholder,
  onCommit,
}: {
  value: number | null;
  placeholder: number;
  onCommit: (value: number | null) => void;
}) {
  const [text, setText] = useState(value != null ? String(value) : "");

  useEffect(() => {
    setText(value != null ? String(value) : "");
  }, [value]);

  function commit() {
    const trimmed = text.trim();
    if (trimmed === "") {
      onCommit(null);
      return;
    }
    const parsed = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setText(value != null ? String(value) : "");
      return;
    }
    onCommit(parsed);
  }

  return (
    <input
      className="rate-input"
      inputMode="decimal"
      value={text}
      placeholder={placeholder ? String(placeholder) : "—"}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function ClientNameInput({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder: string;
  onCommit: (value: string | null) => void;
}) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  return (
    <input
      className="name-input"
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(text)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

type Section = "import" | "history" | "clients";

const ALL_FROM = "2000-01-01";
const ALL_TO = "2999-12-31";

function Main({
  status,
  onDisconnect,
}: {
  status: AppStatus;
  onDisconnect: () => void;
}) {
  const [section, setSection] = useState<Section>("import");
  const [selectedMonth, setSelectedMonth] = useState(currentYearMonth());
  const [custom, setCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(`${currentYearMonth()}-01`);
  const [customTo, setCustomTo] = useState(today());
  const [viewLoaded, setViewLoaded] = useState(false);

  const [rates, setRates] = useState<RatesConfig>({
    mode: "hour",
    default_rate: 0,
    shared_rate: 0,
    currency: "€",
  });
  const [rateMode, setRateMode] = useState("hour");
  const [rateDefault, setRateDefault] = useState("0");
  const [rateShared, setRateShared] = useState("0");
  const [rateCurrency, setRateCurrency] = useState("€");

  const [calendars, setCalendars] = useState<CalendarEntry[]>([]);
  const [incomeMonths, setIncomeMonths] = useState<MonthlyIncome[]>([]);
  const [incomeClients, setIncomeClients] = useState<ClientIncome[]>([]);
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [allClients, setAllClients] = useState<ClientIncome[]>([]);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [clientClasses, setClientClasses] = useState<ClassDetail[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClassDetail[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { year: selectedYear, month: selectedMonthIndex } =
    yearMonthOf(selectedMonth);
  const from = custom
    ? customFrom
    : firstDayOfMonth(selectedYear, selectedMonthIndex);
  const to = custom ? customTo : endDateForMonth(selectedMonth);

  const selectedIds = useMemo(
    () => calendars.filter((c) => c.selected).map((c) => c.id),
    [calendars],
  );

  const totalClasses = useMemo(
    () => incomeMonths.reduce((sum, m) => sum + m.classes, 0),
    [incomeMonths],
  );
  const totalIncome = useMemo(
    () => incomeMonths.reduce((sum, m) => sum + m.amount, 0),
    [incomeMonths],
  );
  const maxMonth = useMemo(
    () => incomeMonths.reduce((max, m) => Math.max(max, m.classes), 0),
    [incomeMonths],
  );
  const periodLabel = custom
    ? `${formatMonth(from.slice(0, 7))} – ${formatMonth(to.slice(0, 7))}`
    : formatMonth(selectedMonth);
  const sharedCount = useMemo(
    () => classes.filter((c) => c.shared && !c.discarded).length,
    [classes],
  );
  const pendingCount = useMemo(
    () => classes.filter((c) => !c.accepted && !c.discarded).length,
    [classes],
  );
  const allTimeClasses = useMemo(
    () => allClients.reduce((sum, c) => sum + c.classes, 0),
    [allClients],
  );
  const allTimeIncome = useMemo(
    () => allClients.reduce((sum, c) => sum + c.amount, 0),
    [allClients],
  );

  const money = useCallback(
    (value: number) => `${rates.currency}${value.toFixed(2)}`,
    [rates.currency],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [months, clients, groups, everyone] = await Promise.all([
        api.incomeByMonth(from, to),
        api.incomeByClient(from, to, null),
        api.listClasses(from, to),
        api.incomeByClient(ALL_FROM, ALL_TO, null),
      ]);
      setIncomeMonths(months);
      setIncomeClients(clients);
      setClasses(groups);
      setAllClients(everyone);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await api.getSettingValue("view_state");
        if (raw) {
          const saved = JSON.parse(raw) as Partial<{
            section: Section;
            selectedMonth: string;
            custom: boolean;
            customFrom: string;
            customTo: string;
          }>;
          if (
            saved.section === "import" ||
            saved.section === "history" ||
            saved.section === "clients"
          ) {
            setSection(saved.section);
          }
          if (saved.selectedMonth) setSelectedMonth(saved.selectedMonth);
          if (typeof saved.custom === "boolean") setCustom(saved.custom);
          if (saved.customFrom) setCustomFrom(saved.customFrom);
          if (saved.customTo) setCustomTo(saved.customTo);
        } else {
          const latest = await api.latestEventMonth();
          if (latest) setSelectedMonth(latest);
        }
      } catch {
        // vista guardada ilegible: se usan los valores por defecto
      } finally {
        setViewLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!viewLoaded) return;
    void loadData();
  }, [loadData, viewLoaded]);

  useEffect(() => {
    if (!viewLoaded) return;
    void api
      .setSettingValue(
        "view_state",
        JSON.stringify({ section, selectedMonth, custom, customFrom, customTo }),
      )
      .catch(() => undefined);
  }, [viewLoaded, section, selectedMonth, custom, customFrom, customTo]);

  useEffect(() => {
    api
      .listCalendars()
      .then(setCalendars)
      .catch((err) => setError(String(err)));
    api
      .getRatesConfig()
      .then((config) => {
        setRates(config);
        setRateMode(config.mode);
        setRateDefault(String(config.default_rate));
        setRateShared(String(config.shared_rate));
        setRateCurrency(config.currency);
      })
      .catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    if (!expanded) {
      setDetail([]);
      return;
    }
    api
      .classDetail(from, to, expanded)
      .then(setDetail)
      .catch((err) => setError(String(err)));
  }, [expanded, from, to]);

  useEffect(() => {
    if (!selectedClient) {
      setClientClasses([]);
      return;
    }
    api
      .classDetail(ALL_FROM, ALL_TO, selectedClient)
      .then(setClientClasses)
      .catch((err) => setError(String(err)));
  }, [selectedClient]);

  async function sync() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const summary = await api.syncEvents(selectedIds, from, to);
      setNotice(
        `Sincronizado: ${summary.classes} clases contabilizadas de ${summary.fetched} eventos.`,
      );
      await loadData();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleCalendar(id: string) {
    const updated = calendars.map((c) =>
      c.id === id ? { ...c, selected: !c.selected } : c,
    );
    setCalendars(updated);
    try {
      await api.setSelectedCalendars(updated.filter((c) => c.selected).map((c) => c.id));
    } catch (err) {
      setError(String(err));
    }
  }

  async function saveRates() {
    try {
      await api.setRatesConfig(
        rateMode,
        Number(rateDefault.replace(",", ".")) || 0,
        Number(rateShared.replace(",", ".")) || 0,
        rateCurrency.trim() || "€",
      );
      setRates(await api.getRatesConfig());
      await loadData();
    } catch (err) {
      setError(String(err));
    }
  }

  async function changeClientRate(email: string, rate: number | null) {
    try {
      await api.setClientRate(email, rate);
      await loadData();
    } catch (err) {
      setError(String(err));
    }
  }

  async function changeClientName(email: string, name: string | null) {
    try {
      await api.setClientName(email, name && name.trim() ? name.trim() : null);
      await loadData();
    } catch (err) {
      setError(String(err));
    }
  }

  async function acceptImport() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const accepted = await api.acceptImport(from, to);
      setNotice(
        accepted > 0
          ? `Importación aceptada: ${accepted} clase${accepted === 1 ? "" : "s"} añadida${accepted === 1 ? "" : "s"} al Histórico.`
          : "No había clases pendientes que aceptar.",
      );
      await loadData();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function reviewEvent(id: string, review: "accepted" | "discarded" | "pending") {
    try {
      await api.setEventReview(id, review);
      await loadData();
    } catch (err) {
      setError(String(err));
    }
  }

  async function exportCsv() {
    try {
      const csv = await api.exportCsv(from, to, expanded);
      downloadCsv(`clases_${from}_${to}.csv`, csv);
    } catch (err) {
      setError(String(err));
    }
  }

  async function disconnect() {
    try {
      await api.disconnectGoogle();
      onDisconnect();
    } catch (err) {
      setError(String(err));
    }
  }

  function shiftMonth(delta: number) {
    const date = new Date(selectedYear, selectedMonthIndex + delta, 1);
    setSelectedMonth(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    );
  }

  function toggleCustom() {
    if (!custom) {
      setCustomFrom(firstDayOfMonth(selectedYear, selectedMonthIndex));
      setCustomTo(endDateForMonth(selectedMonth));
    }
    setCustom((value) => !value);
  }

  const rateUnit = rates.mode === "class" ? "clase" : "hora";

  return (
    <div className="app">
      <header className="appbar">
        <Brand />
        <nav className="tabs">
          {(
            [
              ["import", "Importación"],
              ["history", "Histórico"],
              ["clients", "Clientes"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={section === value ? "tab active" : "tab"}
              onClick={() => {
                setSection(value);
                setNotice(null);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="appbar-actions">
          {status.email && <span className="account">{status.email}</span>}
          <button className="ghost" onClick={disconnect}>
            Desconectar
          </button>
        </div>
      </header>

      <div className="sheet">
        <UpdateBanner />
        <section className="card controls">
        {!custom ? (
          <div className="field">
            <label>Mes</label>
            <div className="month-nav">
              <button
                type="button"
                className="icon-btn"
                onClick={() => shiftMonth(-1)}
                aria-label="Mes anterior"
              >
                ‹
              </button>
              <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />
              <button
                type="button"
                className="icon-btn"
                onClick={() => shiftMonth(1)}
                aria-label="Mes siguiente"
              >
                ›
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="field">
              <label>Desde</label>
              <MonthPicker
                value={customFrom.slice(0, 7)}
                onChange={(ym) => setCustomFrom(`${ym}-01`)}
              />
            </div>
            <div className="field">
              <label>Hasta</label>
              <MonthPicker
                value={customTo.slice(0, 7)}
                onChange={(ym) => setCustomTo(endDateForMonth(ym))}
              />
            </div>
          </>
        )}
        <div className="controls-actions">
          <button className="ghost" onClick={toggleCustom}>
            {custom ? "Ver por mes" : "Periodo personalizado"}
          </button>
          <span className="period-hint muted small">
            del {formatDate(from)} al {formatDate(to)}
          </span>
        </div>
      </section>

      {section === "import" && notice && <div className="alert ok">{notice}</div>}
      {error && <div className="alert error">{error}</div>}

      {section === "import" ? (
        <>
          <section className="card">
            <div className="card-head">
              <h2>Sincronización</h2>
              <button onClick={sync} disabled={busy}>
                {busy ? "Sincronizando…" : "Sincronizar con Google"}
              </button>
            </div>
            {status.last_sync && (
              <p className="muted small">
                Última sincronización: {formatTimestamp(status.last_sync)}
              </p>
            )}
            <div className="calendar-list">
              {calendars.map((cal) => (
                <label key={cal.id} className="calendar-item">
                  <input
                    type="checkbox"
                    checked={cal.selected}
                    onChange={() => toggleCalendar(cal.id)}
                  />
                  <span>
                    {cal.summary} {cal.primary && <em className="muted">(principal)</em>}
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="card controls">
            <div className="field">
              <label>Cobrar por</label>
              <select value={rateMode} onChange={(e) => setRateMode(e.target.value)}>
                <option value="hour">Hora</option>
                <option value="class">Clase</option>
              </select>
            </div>
            <div className="field">
              <label>Tarifa normal (1 persona)</label>
              <input
                inputMode="decimal"
                value={rateDefault}
                onChange={(e) => setRateDefault(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Tarifa compartida (por alumno)</label>
              <input
                inputMode="decimal"
                value={rateShared}
                onChange={(e) => setRateShared(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Símbolo</label>
              <input
                className="currency-input"
                value={rateCurrency}
                onChange={(e) => setRateCurrency(e.target.value)}
              />
            </div>
            <div className="controls-actions">
              <button onClick={saveRates}>Guardar tarifas</button>
            </div>
            <p className="muted small full">
              Las clases con más de un invitado usan la tarifa compartida (por alumno). Cada
              cliente puede tener su tarifa individual en el Histórico.
            </p>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Clases importadas ({classes.length})</h2>
              <div className="head-actions">
                <span className="muted small">
                  {sharedCount} compartida{sharedCount === 1 ? "" : "s"}, {pendingCount}{" "}
                  pendiente{pendingCount === 1 ? "" : "s"}
                </span>
                <button onClick={acceptImport} disabled={busy || pendingCount === 0}>
                  Aceptar importación{pendingCount > 0 ? ` (${pendingCount})` : ""}
                </button>
              </div>
            </div>
            {loading ? (
              <p className="muted">Cargando…</p>
            ) : classes.length === 0 ? (
              <p className="muted">
                Sin clases en el periodo. Pulsa «Sincronizar con Google».
              </p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Clase</th>
                    <th>Alumnos</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th className="num">Duración</th>
                    <th className="num">Importe</th>
                    <th className="num">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((item) => (
                    <tr key={item.id} className={item.discarded ? "row-discarded" : undefined}>
                      <td className="nowrap">{formatDateTime(item.start_ts)}</td>
                      <td>{item.summary ?? "(sin título)"}</td>
                      <td>
                        <div className="chips">
                          {item.clients.map((client) => (
                            <span key={client.email} className="chip">
                              {client.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className={item.shared ? "badge shared" : "badge single"}>
                          {item.shared ? "Compartida" : "Individual"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            item.discarded
                              ? "badge discarded"
                              : item.accepted
                                ? "badge accepted"
                                : "badge pending"
                          }
                        >
                          {item.discarded
                            ? "Descartada"
                            : item.accepted
                              ? "Aceptada"
                              : "Pendiente"}
                        </span>
                      </td>
                      <td className="num">
                        {item.duration_min != null ? `${item.duration_min} min` : "—"}
                      </td>
                      <td className="num strong">{money(item.total_amount)}</td>
                      <td className="num actions">
                        {item.discarded ? (
                          <button
                            className="link"
                            onClick={() => reviewEvent(item.id, "pending")}
                          >
                            Restaurar
                          </button>
                        ) : item.accepted ? (
                          <button
                            className="link danger"
                            onClick={() => reviewEvent(item.id, "discarded")}
                          >
                            Descartar
                          </button>
                        ) : (
                          <>
                            <button
                              className="link"
                              onClick={() => reviewEvent(item.id, "accepted")}
                            >
                              Aceptar
                            </button>
                            <button
                              className="link danger"
                              onClick={() => reviewEvent(item.id, "discarded")}
                            >
                              Descartar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : section === "history" ? (
        <>
          <section className="statement">
            <p className="statement-period">{periodLabel}</p>
            <div className="statement-figures">
              <div className="figure">
                <span className="figure-value">{totalClasses}</span>
                <span className="figure-label">clases</span>
              </div>
              <div className="figure">
                <span className="figure-value">{incomeClients.length}</span>
                <span className="figure-label">alumnos</span>
              </div>
              <div className="figure money">
                <span className="figure-value">{money(totalIncome)}</span>
                <span className="figure-label">por cobrar</span>
              </div>
            </div>
          </section>

          <section className="card">
            <h2>Clases por mes</h2>
            {incomeMonths.length === 0 ? (
              <p className="muted">Sin datos en el periodo.</p>
            ) : (
              <div className="chart">
                {incomeMonths.map((m) => (
                  <div key={m.month} className="bar-row">
                    <span className="bar-label">{formatMonth(m.month)}</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ width: `${maxMonth ? (m.classes / maxMonth) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="bar-value">{m.classes}</span>
                    <span className="bar-money">{money(m.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Clases por cliente</h2>
              <button className="ghost" onClick={exportCsv}>
                Exportar CSV
              </button>
            </div>
            {incomeClients.length === 0 ? (
              <p className="muted">Sin clientes en el periodo seleccionado.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Email</th>
                    <th className="num">Clases</th>
                    <th className="num">Horas</th>
                    <th className="num">Tarifa</th>
                    <th className="num">Importe</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {incomeClients.map((client) => (
                    <tr key={client.email}>
                      <td>{client.name}</td>
                      <td className="muted small">{client.email}</td>
                      <td className="num strong">{client.classes}</td>
                      <td className="num">{(client.minutes / 60).toFixed(1)} h</td>
                      <td className="num">
                        {client.rate != null ? (
                          money(client.rate)
                        ) : (
                          <span className="muted">{money(rates.default_rate)}</span>
                        )}
                      </td>
                      <td className="num strong">{money(client.amount)}</td>
                      <td className="num">
                        <button
                          className="link"
                          onClick={() =>
                            setExpanded((current) =>
                              current === client.email ? null : client.email,
                            )
                          }
                        >
                          {expanded === client.email ? "Ocultar" : "Ver clases"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="muted small">
              Solo lectura. Las tarifas se editan en la sección Clientes. Las clases compartidas
              usan {money(rates.shared_rate)}/{rateUnit} por alumno; el resto, la tarifa del
              cliente o la normal ({money(rates.default_rate)}/{rateUnit}).
            </p>

            {expanded && (
              <div className="detail">
                <h3>
                  Clases de{" "}
                  {incomeClients.find((c) => c.email === expanded)?.name ?? expanded}
                </h3>
                {detail.length === 0 ? (
                  <p className="muted">Sin clases registradas.</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Clase</th>
                        <th className="num">Duración</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.map((row) => (
                        <tr key={row.id}>
                          <td>{formatDateTime(row.start_ts)}</td>
                          <td>{row.summary ?? "(sin título)"}</td>
                          <td className="num">
                            {row.duration_min != null ? `${row.duration_min} min` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="statement">
            <p className="statement-period">Todos los clientes</p>
            <div className="statement-figures">
              <div className="figure">
                <span className="figure-value">{allClients.length}</span>
                <span className="figure-label">clientes</span>
              </div>
              <div className="figure">
                <span className="figure-value">{allTimeClasses}</span>
                <span className="figure-label">clases</span>
              </div>
              <div className="figure money">
                <span className="figure-value">{money(allTimeIncome)}</span>
                <span className="figure-label">total</span>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Clientes ({allClients.length})</h2>
              <span className="muted small">
                Nombre y tarifa por {rateUnit} (vacío = tarifa normal)
              </span>
            </div>
            {allClients.length === 0 ? (
              <p className="muted">
                Aún no hay clientes. Sincroniza e importa clases para verlos aquí.
              </p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th className="num">Clases</th>
                    <th className="num">Horas</th>
                    <th className="num">Tarifa</th>
                    <th className="num">Importe</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {allClients.map((client) => (
                    <tr key={client.email}>
                      <td>
                        <ClientNameInput
                          value={client.name}
                          placeholder={client.email}
                          onCommit={(name) => changeClientName(client.email, name)}
                        />
                      </td>
                      <td className="muted small">{client.email}</td>
                      <td className="num strong">{client.classes}</td>
                      <td className="num">{(client.minutes / 60).toFixed(1)} h</td>
                      <td className="num">
                        <RateInput
                          value={client.rate}
                          placeholder={rates.default_rate}
                          onCommit={(rate) => changeClientRate(client.email, rate)}
                        />
                      </td>
                      <td className="num strong">{money(client.amount)}</td>
                      <td className="num">
                        <button
                          className="link"
                          onClick={() =>
                            setSelectedClient((current) =>
                              current === client.email ? null : client.email,
                            )
                          }
                        >
                          {selectedClient === client.email ? "Ocultar" : "Ver clases"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {selectedClient && (
              <div className="detail">
                <h3>
                  Clases de{" "}
                  {allClients.find((c) => c.email === selectedClient)?.name ?? selectedClient}
                </h3>
                {clientClasses.length === 0 ? (
                  <p className="muted">Sin clases registradas.</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Clase</th>
                        <th className="num">Duración</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientClasses.map((row) => (
                        <tr key={row.id}>
                          <td>{formatDateTime(row.start_ts)}</td>
                          <td>{row.summary ?? "(sin título)"}</td>
                          <td className="num">
                            {row.duration_min != null ? `${row.duration_min} min` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </section>
        </>
      )}
      </div>
    </div>
  );
}

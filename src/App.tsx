import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
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
  firstDayOfMonth,
  formatDateTime,
  formatMonth,
  formatRangeLabel,
  formatTimestamp,
  lastDayOfMonth,
  today,
  yearMonthOf,
  type DateRange,
} from "./lib/dates";
import { formatMoney, formatNumber } from "./lib/format";
import { useUpdater } from "./lib/useUpdater";
import logo from "./assets/logo.svg";
import { DateRangePicker } from "./components/DateRangePicker";
import { RateHistoryEditor } from "./components/RateHistoryEditor";
import { SkeletonRows } from "./components/Skeleton";
import { Toasts, useToasts } from "./components/Toasts";
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

function formatDelta(value: number): string {
  if (Math.abs(value) < 0.5) return "0 %";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value)} %`;
}

function deltaClass(value: number): string {
  if (Math.abs(value) < 0.5) return "delta flat";
  return value > 0 ? "delta up" : "delta down";
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

function monthRange(yearMonth: string): DateRange {
  const { year, month } = yearMonthOf(yearMonth);
  return {
    from: firstDayOfMonth(year, month),
    to: endDateForMonth(yearMonth),
  };
}

function isRange(value: unknown): value is DateRange {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as DateRange).from === "string" &&
    typeof (value as DateRange).to === "string"
  );
}

function shiftMonth(range: DateRange, delta: number): DateRange {
  const { year, month } = yearMonthOf(range.from);
  const shifted = new Date(year, month + delta, 1);
  const ym = `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
  return monthRange(ym);
}

function singleMonthOf(range: DateRange): string | null {
  const { year, month } = yearMonthOf(range.from);
  if (range.from !== firstDayOfMonth(year, month)) return null;
  const { year: toYear, month: toMonth } = yearMonthOf(range.to);
  if (toYear !== year || toMonth !== month) return null;
  return range.from.slice(0, 7);
}

type SortKey = "name" | "email" | "classes" | "minutes" | "amount";

interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

function sortClients(list: ClientIncome[], sort: SortState, query: string): ClientIncome[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? list.filter(
        (client) =>
          client.name.toLowerCase().includes(q) || client.email.toLowerCase().includes(q),
      )
    : list;
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...filtered].sort((a, b) => {
    const ka = a[sort.key];
    const kb = b[sort.key];
    if (typeof ka === "string" && typeof kb === "string") {
      return ka.localeCompare(kb, "es") * dir;
    }
    return ((ka as number) - (kb as number)) * dir;
  });
}

function nextSort(current: SortState, key: SortKey): SortState {  if (current.key === key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: key === "name" || key === "email" ? "asc" : "desc" };
}

function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      scope="col"
      className={className}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" className="th-sort" onClick={() => onSort(sortKey)}>
        {label}
        <span className={active ? "sort-caret active" : "sort-caret"} aria-hidden>
          {active ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
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

function ClientNameInput({
  value,
  placeholder,
  disabled,
  onCommit,
}: {
  value: string;
  placeholder: string;
  disabled?: boolean;
  onCommit: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setText(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <button
        type="button"
        className="inline-value name"
        disabled={disabled}
        onClick={() => setEditing(true)}
        title="Editar nombre"
      >
        {value ? value : <span className="muted">{placeholder}</span>}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      className="name-input"
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setEditing(false);
        onCommit(text);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setText(value);
          setEditing(false);
        }
      }}
    />
  );
}

function InlineNumberValue({
  value,
  symbol,
  disabled,
  onCommit,
}: {
  value: number;
  symbol: string;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = text.trim();
    if (trimmed === "") return;
    const parsed = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) return;
    if (parsed !== value) onCommit(parsed);
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="inline-value"
        disabled={disabled}
        onClick={() => {
          setText(String(value));
          setEditing(true);
        }}
        title="Editar"
      >
        {formatNumber(value)} <span className="muted">{symbol}</span>
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      className="settings-input"
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

function InlineTextValue({
  value,
  placeholder,
  disabled,
  onCommit,
}: {
  value: string;
  placeholder: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <button
        type="button"
        className="inline-value"
        disabled={disabled}
        onClick={() => {
          setText(value);
          setEditing(true);
        }}
        title="Editar"
      >
        {value || <span className="muted">{placeholder}</span>}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      className="settings-input"
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const trimmed = text.trim();
        if (trimmed && trimmed !== value) onCommit(trimmed);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

type Section = "import" | "history" | "clients" | "settings";
type Theme = "system" | "light" | "dark";

const SECTION_LABELS: Record<Section, string> = {
  import: "Importación",
  history: "Histórico",
  clients: "Clientes",
  settings: "Ajustes",
};

const DEFAULT_SECTION_ORDER: Section[] = ["history", "clients", "import", "settings"];

function normalizeSectionOrder(value: unknown): Section[] | null {
  if (!Array.isArray(value)) return null;
  const valid = value.filter(
    (item): item is Section =>
      item === "import" || item === "history" || item === "clients" || item === "settings",
  );
  if (valid.length !== DEFAULT_SECTION_ORDER.length) return null;
  if (new Set(valid).size !== DEFAULT_SECTION_ORDER.length) return null;
  return valid;
}

const ALL_FROM = "2000-01-01";
const ALL_TO = "2999-12-31";

function Main({
  status,
  onDisconnect,
}: {
  status: AppStatus;
  onDisconnect: () => void;
}) {
  const [section, setSection] = useState<Section>("history");
  const [sectionOrder, setSectionOrder] = useState<Section[]>(DEFAULT_SECTION_ORDER);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [importRange, setImportRange] = useState<DateRange>(() =>
    monthRange(currentYearMonth()),
  );
  const [historyRange, setHistoryRange] = useState<DateRange>(() =>
    monthRange(currentYearMonth()),
  );
  const [viewLoaded, setViewLoaded] = useState(false);

  const [rates, setRates] = useState<RatesConfig>({
    mode: "class",
    default_rate: 0,
    shared_rate: 0,
    currency: "€",
  });

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
  const [syncCollapsed, setSyncCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [historySort, setHistorySort] = useState<SortState>({ key: "amount", dir: "desc" });
  const [clientsSort, setClientsSort] = useState<SortState>({ key: "name", dir: "asc" });
  const [historyQuery, setHistoryQuery] = useState("");
  const [clientsQuery, setClientsQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const suppressTabClick = useRef(false);
  const tabPositions = useRef<Map<string, number>>(new Map());
  const [theme, setTheme] = useState<Theme>("system");
  const updater = useUpdater();
  const [appVersion, setAppVersion] = useState("");
  const [pendingTotal, setPendingTotal] = useState(0);
  const [classFilter, setClassFilter] = useState<"all" | "pending" | "accepted" | "discarded">(
    "pending",
  );
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(() => new Set());
  const [needsReauth, setNeedsReauth] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(true);
  const [prevTotals, setPrevTotals] = useState<MonthlyIncome | null>(null);

  const isPending = useCallback((key: string) => pending.has(key), [pending]);

  const withPending = useCallback(async (key: string, action: () => Promise<void>) => {
    setPending((current) => new Set(current).add(key));
    try {
      await action();
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointer(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    api
      .getSettingValue("theme")
      .then((value) => {
        if (value === "light" || value === "dark" || value === "system") {
          setTheme(value);
        }
      })
      .catch(() => undefined);
    api
      .getSettingValue("onboarding_done")
      .then((value) => setOnboardingDismissed(value === "1"))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
    try {
      if (theme === "system") localStorage.removeItem("facturita-theme");
      else localStorage.setItem("facturita-theme", theme);
    } catch {
      // sin localStorage
    }
  }, [theme]);

  useEffect(() => {
    function handleReauth() {
      setNeedsReauth(true);
    }
    window.addEventListener("facturita:reauth", handleReauth);
    return () => window.removeEventListener("facturita:reauth", handleReauth);
  }, []);

  const changeTheme = useCallback((value: Theme) => {
    setTheme(value);
    void api.setSettingValue("theme", value).catch(() => undefined);
  }, []);

  const moveSection = useCallback((from: number, to: number) => {
    setSectionOrder((order) => {
      if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) {
        return order;
      }
      const nodes = tabsRef.current?.querySelectorAll<HTMLElement>(".tab");
      if (nodes) {
        const positions = new Map<string, number>();
        nodes.forEach((node) => {
          const key = node.dataset.section;
          if (key) positions.set(key, node.getBoundingClientRect().left);
        });
        tabPositions.current = positions;
      }
      const next = [...order];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    const nodes = tabsRef.current?.querySelectorAll<HTMLElement>(".tab");
    if (!nodes) return;
    nodes.forEach((node) => {
      const key = node.dataset.section;
      if (!key) return;
      const previous = tabPositions.current.get(key);
      if (previous == null) return;
      const delta = previous - node.getBoundingClientRect().left;
      if (Math.abs(delta) < 1) return;
      node.style.transition = "none";
      node.style.transform = `translateX(${delta}px)`;
      void node.offsetWidth;
      requestAnimationFrame(() => {
        node.style.transition = "transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)";
        node.style.transform = "translateX(0)";
      });
    });
    tabPositions.current = new Map();
  }, [sectionOrder]);

  const handleTabPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, index: number) => {
      if (event.button !== 0) return;
      const startX = event.clientX;
      const startY = event.clientY;
      let current = index;
      let active = false;

      function targetIndex(pointerX: number): number {
        const nodes = tabsRef.current?.querySelectorAll<HTMLElement>(".tab");
        if (!nodes || nodes.length === 0) return current;
        for (let i = 0; i < nodes.length; i += 1) {
          const rect = nodes[i].getBoundingClientRect();
          if (pointerX < rect.left + rect.width / 2) return i;
        }
        return nodes.length - 1;
      }

      function onMove(moveEvent: PointerEvent) {
        if (!active) {
          if (Math.abs(moveEvent.clientX - startX) + Math.abs(moveEvent.clientY - startY) < 5) {
            return;
          }
          active = true;
          setDragIndex(current);
          document.body.classList.add("reordering");
        }
        const target = targetIndex(moveEvent.clientX);
        if (target !== current) {
          moveSection(current, target);
          current = target;
          setDragIndex(target);
        }
      }

      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        document.body.classList.remove("reordering");
        setDragIndex(null);
        if (active) {
          suppressTabClick.current = true;
          window.setTimeout(() => {
            suppressTabClick.current = false;
          }, 0);
        }
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [moveSection],
  );

  const { from, to } = historyRange;

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
  const pendingCount = useMemo(
    () => classes.filter((c) => !c.accepted && !c.discarded).length,
    [classes],
  );

  const visibleClasses = useMemo(() => {
    switch (classFilter) {
      case "pending":
        return classes.filter((c) => !c.accepted && !c.discarded);
      case "accepted":
        return classes.filter((c) => c.accepted && !c.discarded);
      case "discarded":
        return classes.filter((c) => c.discarded);
      default:
        return classes;
    }
  }, [classes, classFilter]);

  const selectedVisibleCount = useMemo(
    () => visibleClasses.filter((item) => selectedEvents.has(item.id)).length,
    [visibleClasses, selectedEvents],
  );

  const prevDelta = useMemo(() => {
    if (!prevTotals) return null;
    const classesDelta =
      prevTotals.classes > 0
        ? ((totalClasses - prevTotals.classes) / prevTotals.classes) * 100
        : null;
    const incomeDelta =
      prevTotals.amount > 0 ? ((totalIncome - prevTotals.amount) / prevTotals.amount) * 100 : null;
    return { classesDelta, incomeDelta };
  }, [prevTotals, totalClasses, totalIncome]);

  const money = useCallback(
    (value: number) => formatMoney(value, rates.currency),
    [rates.currency],
  );

  const visibleIncomeClients = useMemo(
    () => sortClients(incomeClients, historySort, historyQuery),
    [incomeClients, historySort, historyQuery],
  );

  const visibleAllClients = useMemo(
    () => sortClients(allClients, clientsSort, clientsQuery),
    [allClients, clientsSort, clientsQuery],
  );

  const handleHistorySort = (key: SortKey) =>
    setHistorySort((current) => nextSort(current, key));
  const handleClientsSort = (key: SortKey) =>
    setClientsSort((current) => nextSort(current, key));

  const loadData = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      setError(null);
      try {
        const [months, clients, groups, everyone, pending] = await Promise.all([
          api.incomeByMonth(from, to),
          api.incomeByClient(from, to, null),
          api.listClasses(ALL_FROM, ALL_TO),
          api.incomeByClient(ALL_FROM, ALL_TO, null),
          api.pendingCount(),
        ]);
        setIncomeMonths(months);
        setIncomeClients(clients);
        setClasses(groups);
        setAllClients(everyone);
        setPendingTotal(pending);
      } catch (err) {
        setError(String(err));
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [from, to],
  );

  const reloadClientClasses = useCallback(
    (email: string) =>
      api
        .classDetail(ALL_FROM, ALL_TO, email)
        .then(setClientClasses)
        .catch((err) => setError(String(err))),
    [],
  );

  useEffect(() => {
    if (section !== "history") {
      setPrevTotals(null);
      return;
    }
    if (!singleMonthOf(historyRange)) {
      setPrevTotals(null);
      return;
    }
    const previous = shiftMonth(historyRange, -1);
    api
      .incomeByMonth(previous.from, previous.to)
      .then((months) => setPrevTotals(months[0] ?? { month: "", classes: 0, amount: 0 }))
      .catch(() => setPrevTotals(null));
  }, [section, historyRange]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await api.getSettingValue("view_state");
        let restored = false;
        if (raw) {
          const saved = JSON.parse(raw) as Partial<{
            section: Section;
            importRange: DateRange;
            historyRange: DateRange;
            selectedMonth: string;
            custom: boolean;
            customFrom: string;
            customTo: string;
            syncCollapsed: boolean;
            sectionOrder: unknown;
          }>;
          if (
            saved.section === "import" ||
            saved.section === "history" ||
            saved.section === "clients" ||
            saved.section === "settings"
          ) {
            setSection(saved.section);
          }
          const savedOrder = normalizeSectionOrder(saved.sectionOrder);
          if (savedOrder) setSectionOrder(savedOrder);
          if (typeof saved.syncCollapsed === "boolean") {
            setSyncCollapsed(saved.syncCollapsed);
          }
          if (isRange(saved.importRange)) {
            setImportRange(saved.importRange);
            restored = true;
          }
          if (isRange(saved.historyRange)) {
            setHistoryRange(saved.historyRange);
            restored = true;
          } else if (saved.custom && saved.customFrom && saved.customTo) {
            setHistoryRange({ from: saved.customFrom, to: saved.customTo });
            restored = true;
          } else if (saved.selectedMonth) {
            setHistoryRange(monthRange(saved.selectedMonth));
            restored = true;
          }
          if (!isRange(saved.importRange) && saved.selectedMonth) {
            setImportRange(monthRange(saved.selectedMonth));
          }
        }
        if (!restored) {
          const latest = await api.latestEventMonth();
          if (latest) setHistoryRange(monthRange(latest));
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
        JSON.stringify({ section, importRange, historyRange, syncCollapsed, sectionOrder }),
      )
      .catch(() => undefined);
  }, [viewLoaded, section, importRange, historyRange, syncCollapsed, sectionOrder]);

  useEffect(() => {
    api
      .listCalendars()
      .then(setCalendars)
      .catch((err) => setError(String(err)));
    api
      .getRatesConfig()
      .then((config) => setRates(config))
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
    void reloadClientClasses(selectedClient);
  }, [selectedClient, reloadClientClasses]);

  async function sync() {
    setBusy(true);
    setError(null);
    try {
      const summary = await api.syncEvents(selectedIds, importRange.from, importRange.to);
      pushToast(
        "success",
        `Importadas: ${summary.classes} clases contabilizadas de ${summary.fetched} eventos.`,
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

  function persistRates(
    patch: Partial<Pick<RatesConfig, "default_rate" | "shared_rate" | "currency">>,
  ) {
    const next = {
      mode: "class",
      default_rate: patch.default_rate ?? rates.default_rate,
      shared_rate: patch.shared_rate ?? rates.shared_rate,
      currency: patch.currency ?? rates.currency,
    };
    if (
      next.default_rate === rates.default_rate &&
      next.shared_rate === rates.shared_rate &&
      next.currency === rates.currency
    ) {
      return Promise.resolve();
    }
    return withPending("rates", async () => {
      try {
        await api.setRatesConfig(next.mode, next.default_rate, next.shared_rate, next.currency);
        setRates(await api.getRatesConfig());
        await loadData({ silent: true });
        pushToast("success", "Tarifas guardadas.");
      } catch (err) {
        setError(String(err));
      }
    });
  }

  function changeClientName(email: string, name: string | null) {
    return withPending(`name:${email}`, async () => {
      try {
        await api.setClientName(email, name && name.trim() ? name.trim() : null);
        await loadData();
        pushToast("success", "Nombre actualizado.");
      } catch (err) {
        setError(String(err));
      }
    });
  }

  async function acceptImport() {
    setBusy(true);
    setError(null);
    try {
      const accepted = await api.acceptImport(ALL_FROM, ALL_TO);
      pushToast(
        accepted > 0 ? "success" : "info",
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

  function reviewEvent(id: string, review: "accepted" | "discarded" | "pending") {
    return withPending(`review:${id}`, async () => {
      try {
        await api.setEventReview(id, review);
        await loadData();
      } catch (err) {
        setError(String(err));
      }
    });
  }

  function reviewSelected(review: "accepted" | "discarded" | "pending") {
    const ids = visibleClasses.filter((item) => selectedEvents.has(item.id)).map((item) => item.id);
    if (ids.length === 0) return Promise.resolve();
    return withPending("bulk", async () => {
      try {
        await api.setEventsReview(ids, review);
        setSelectedEvents(new Set());
        await loadData();
      } catch (err) {
        setError(String(err));
      }
    });
  }

  function toggleEventSelection(id: string) {
    setSelectedEvents((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectVisible() {
    setSelectedEvents((current) => {
      const allSelected = visibleClasses.every((item) => current.has(item.id));
      const next = new Set(current);
      for (const item of visibleClasses) {
        if (allSelected) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
  }

  function dismissOnboarding() {
    setOnboardingDismissed(true);
    void api.setSettingValue("onboarding_done", "1").catch(() => undefined);
  }

  async function checkForUpdates() {
    setMenuOpen(false);
    const result = await updater.checkNow();
    if (result.error) {
      pushToast("error", result.error);
    } else if (result.update) {
      pushToast("info", `Nueva versión ${result.update.version} disponible.`);
    } else {
      pushToast("success", "Estás en la última versión.");
    }
  }

  function exportCsv() {
    return withPending("csv", async () => {
      try {
        const csv = await api.exportCsv(from, to, expanded);
        downloadCsv(`clases_${from}_${to}.csv`, csv);
        pushToast("success", "CSV exportado.");
      } catch (err) {
        setError(String(err));
      }
    });
  }

  async function disconnect() {
    if (
      !window.confirm(
        "Se cerrará la sesión de Google. Podrás volver a conectar cuando quieras. ¿Continuar?",
      )
    ) {
      return;
    }
    try {
      await api.disconnectGoogle();
      onDisconnect();
    } catch (err) {
      setError(String(err));
    }
  }

  async function reconnect() {
    setBusy(true);
    setError(null);
    try {
      await api.connectGoogle();
      setNeedsReauth(false);
      onDisconnect();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  function exportBackup() {
    return withPending("backup", async () => {
      setError(null);
      try {
        const path = await api.exportBackup();
        if (path) pushToast("success", `Copia de seguridad guardada en ${path}`);
      } catch (err) {
        setError(String(err));
      }
    });
  }

  function importBackup() {
    if (
      !window.confirm(
        "Se reemplazarán TODOS los datos actuales por los de la copia. ¿Continuar?",
      )
    ) {
      return;
    }
    return withPending("backup", async () => {
      setError(null);
      try {
        const summary = await api.importBackup();
        if (summary) {
          setSelectedClient(null);
          setExpanded(null);
          await loadData();
          pushToast(
            "success",
            `Copia restaurada: ${summary.events} eventos, ${summary.clients} invitaciones, ${summary.rates} tarifas y ${summary.names} nombres.`,
          );
        }
      } catch (err) {
        setError(String(err));
      }
    });
  }

  const rateUnit = rates.mode === "class" ? "clase" : "hora";

  return (
    <div className="app">
      <header className="appbar">
        <Brand />
        <nav className="tabs" ref={tabsRef}>
          {sectionOrder.map((value, index) => (
            <button
              key={value}
              type="button"
              data-section={value}
              className={
                "tab" + (section === value ? " active" : "") + (dragIndex === index ? " dragging" : "")
              }
              onPointerDown={(event) => handleTabPointerDown(event, index)}
              onClick={() => {
                if (suppressTabClick.current) return;
                setSection(value);
              }}
              onKeyDown={(event) => {
                if (!event.altKey) return;
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  moveSection(index, index - 1);
                } else if (event.key === "ArrowRight") {
                  event.preventDefault();
                  moveSection(index, index + 1);
                }
              }}
              title="Arrastra para reordenar (Alt + ←/→)"
            >
              {SECTION_LABELS[value]}
              {value === "import" && pendingTotal > 0 && (
                <span
                  className="tab-badge"
                  title={`${pendingTotal} clases pendientes de aceptar`}
                >
                  {pendingTotal}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="appbar-actions">
          <div className="account-menu" ref={menuRef}>
            <button
              type="button"
              className="account"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {status.email ?? "Cuenta"}
              <span className="caret-sm" aria-hidden>
                ▾
              </span>
            </button>
            {menuOpen && (
              <div className="menu" role="menu">
                <div className="menu-label" id="theme-label">
                  Tema
                </div>
                <div className="menu-theme" role="group" aria-labelledby="theme-label">
                  {(
                    [
                      ["system", "Sistema"],
                      ["light", "Claro"],
                      ["dark", "Oscuro"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={theme === value}
                      className={theme === value ? "menu-item active" : "menu-item"}
                      onClick={() => changeTheme(value)}
                    >
                      {label}
                      {theme === value && (
                        <span className="menu-check" aria-hidden>
                          ✓
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="menu-sep" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  disabled={updater.checking}
                  onClick={() => void checkForUpdates()}
                >
                  {updater.checking ? "Buscando…" : "Buscar actualizaciones"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item danger"
                  onClick={() => {
                    setMenuOpen(false);
                    void disconnect();
                  }}
                >
                  Desconectar
                </button>
                {appVersion && <div className="menu-version">Facturita v{appVersion}</div>}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="sheet">
        <Toasts toasts={toasts} onDismiss={dismissToast} />
        <UpdateBanner updater={updater} />
        {section === "history" && (
          <section className="card controls">
            <div className="field">
              <label>Periodo</label>
              <div className="range-nav">
                <button
                  type="button"
                  className="ghost nav-btn"
                  aria-label="Mes anterior"
                  onClick={() => setHistoryRange(shiftMonth(historyRange, -1))}
                >
                  ‹
                </button>
                <DateRangePicker
                  value={historyRange}
                  onChange={setHistoryRange}
                  presets
                />
                <button
                  type="button"
                  className="ghost nav-btn"
                  aria-label="Mes siguiente"
                  onClick={() => setHistoryRange(shiftMonth(historyRange, 1))}
                >
                  ›
                </button>
              </div>
            </div>
            <div className="controls-actions statement-inline">
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
              {prevDelta && (prevDelta.classesDelta != null || prevDelta.incomeDelta != null) && (
                <p className="statement-delta muted small">
                  {prevTotals?.month ? `vs. ${formatMonth(prevTotals.month)}: ` : ""}
                  {prevDelta.classesDelta != null && (
                    <span className={deltaClass(prevDelta.classesDelta)}>
                      clases {formatDelta(prevDelta.classesDelta)}
                    </span>
                  )}
                  {prevDelta.classesDelta != null && prevDelta.incomeDelta != null && " · "}
                  {prevDelta.incomeDelta != null && (
                    <span className={deltaClass(prevDelta.incomeDelta)}>
                      importe {formatDelta(prevDelta.incomeDelta)}
                    </span>
                  )}
                </p>
              )}
            </div>
          </section>
        )}

      {error && (
        <div className="alert error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="alert-close"
            aria-label="Cerrar error"
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}

      {needsReauth && (
        <div className="alert warn" role="alert">
          <span>Tu sesión de Google caducó o fue revocada. Vuelve a conectar para continuar.</span>
          <button type="button" onClick={reconnect} disabled={busy}>
            {busy ? "Conectando…" : "Reconectar con Google"}
          </button>
        </div>
      )}

      {section === "import" ? (
        <>
          {!onboardingDismissed && allClients.length === 0 && (
            <section className="card onboarding">
              <div className="onboarding-head">
                <h2>Primeros pasos</h2>
                <button
                  type="button"
                  className="alert-close"
                  aria-label="Ocultar primeros pasos"
                  onClick={dismissOnboarding}
                >
                  ×
                </button>
              </div>
              <ol className="onboarding-steps">
                <li>
                  Pulsa <strong>Importar</strong> y elige el periodo que quieras traer.
                </li>
                <li>
                  <strong>Revisa</strong> las clases importadas y ajusta las tarifas si hace falta.
                </li>
                <li>
                  Pulsa <strong>Aceptar todo</strong> para agregarlas al Histórico y a los importes
                  por cliente.
                </li>
              </ol>
            </section>
          )}
          <section className={syncCollapsed ? "card collapsed" : "card"}>
            <div className="card-head">
              <button
                type="button"
                className="collapse-toggle"
                aria-expanded={!syncCollapsed}
                aria-controls="sync-body"
                onClick={() => setSyncCollapsed((value) => !value)}
              >
                <span className="caret" aria-hidden>
                  ▾
                </span>
                <h2>Importar clases</h2>
                {syncCollapsed && (
                  <span className="muted small collapse-summary">
                    {formatRangeLabel(importRange.from, importRange.to)}
                    {selectedIds.length > 0 &&
                      ` · ${selectedIds.length} calendario${selectedIds.length === 1 ? "" : "s"}`}
                  </span>
                )}
              </button>
              <button onClick={sync} disabled={busy}>
                {busy ? "Importando…" : "Importar"}
              </button>
            </div>
            {!syncCollapsed && (
              <div id="sync-body" className="collapse-body">
                <div className="field">
                  <label>Periodo a importar</label>
                  <div className="range-nav">
                    <button
                      type="button"
                      className="ghost nav-btn"
                      aria-label="Mes anterior"
                      onClick={() => setImportRange(shiftMonth(importRange, -1))}
                    >
                      ‹
                    </button>
                    <DateRangePicker value={importRange} onChange={setImportRange} presets />
                    <button
                      type="button"
                      className="ghost nav-btn"
                      aria-label="Mes siguiente"
                      onClick={() => setImportRange(shiftMonth(importRange, 1))}
                    >
                      ›
                    </button>
                  </div>
                </div>
                <p className="muted small">
                  Se importarán las clases de este periodo desde los calendarios seleccionados;
                  después aparecerán abajo para revisarlas.
                </p>
                {status.last_sync && (
                  <p className="muted small">
                    Última importación: {formatTimestamp(status.last_sync)}
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
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Clases importadas</h2>
              <div className="head-actions">
                <span className="muted small">
                  {pendingCount} pendiente{pendingCount === 1 ? "" : "s"} de revisar
                </span>
                <button onClick={acceptImport} disabled={busy || pendingCount === 0}>
                  Aceptar todo{pendingCount > 0 ? ` (${pendingCount})` : ""}
                </button>
              </div>
            </div>

            <div className="table-toolbar">
              <div className="segmented" role="group" aria-label="Filtrar clases por estado">
                {(
                  [
                    ["all", "Todas"],
                    ["pending", "Pendientes"],
                    ["accepted", "Aceptadas"],
                    ["discarded", "Descartadas"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={classFilter === value ? "seg active" : "seg"}
                    aria-pressed={classFilter === value}
                    onClick={() => setClassFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {selectedVisibleCount > 0 && (
                <div className="bulk-actions">
                  <span className="muted small">{selectedVisibleCount} seleccionadas</span>
                  <button
                    className="ghost"
                    disabled={isPending("bulk")}
                    onClick={() => reviewSelected("accepted")}
                  >
                    Aceptar
                  </button>
                  <button
                    className="ghost"
                    disabled={isPending("bulk")}
                    onClick={() => reviewSelected("discarded")}
                  >
                    Descartar
                  </button>
                  <button className="link" onClick={() => setSelectedEvents(new Set())}>
                    Quitar selección
                  </button>
                </div>
              )}
            </div>

            {loading ? (
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    <SkeletonRows rows={5} cols={8} />
                  </tbody>
                </table>
              </div>
            ) : classes.length === 0 ? (
              <div className="empty">
                <p className="muted">Todavía no has importado ninguna clase.</p>
                <button onClick={sync} disabled={busy}>
                  {busy ? "Importando…" : "Importar clases"}
                </button>
              </div>
            ) : visibleClasses.length === 0 ? (
              <p className="muted">No hay clases con ese filtro.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">
                    Clases importadas en el periodo seleccionado
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="sel">
                        <input
                          type="checkbox"
                          aria-label="Seleccionar todas las clases visibles"
                          checked={
                            visibleClasses.length > 0 &&
                            selectedVisibleCount === visibleClasses.length
                          }
                          onChange={toggleSelectVisible}
                        />
                      </th>
                      <th scope="col">Fecha</th>
                      <th scope="col">Clase</th>
                      <th scope="col">Alumnos</th>
                      <th scope="col">Tipo</th>
                      <th scope="col">Estado</th>
                      <th scope="col" className="num">
                        Duración
                      </th>
                      <th scope="col" className="num">
                        Importe
                      </th>
                      <th scope="col" className="num">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleClasses.map((item) => {
                      const rowPending = isPending(`review:${item.id}`);
                      const checked = selectedEvents.has(item.id);
                      return (
                        <tr
                          key={item.id}
                          className={item.discarded ? "row-discarded" : undefined}
                        >
                          <td className="sel">
                            <input
                              type="checkbox"
                              checked={checked}
                              aria-label={`Seleccionar ${item.summary ?? "clase"}`}
                              onChange={() => toggleEventSelection(item.id)}
                            />
                          </td>
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
                                disabled={rowPending}
                                onClick={() => reviewEvent(item.id, "pending")}
                              >
                                Restaurar
                              </button>
                            ) : item.accepted ? (
                              <button
                                className="link danger"
                                disabled={rowPending}
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      `¿Descartar «${item.summary ?? "la clase"}»? Dejará de contar en el Histórico.`,
                                    )
                                  ) {
                                    return;
                                  }
                                  void reviewEvent(item.id, "discarded");
                                }}
                              >
                                Descartar
                              </button>
                            ) : (
                              <>
                                <button
                                  className="link"
                                  disabled={rowPending}
                                  onClick={() => reviewEvent(item.id, "accepted")}
                                >
                                  Aceptar
                                </button>
                                <button
                                  className="link danger"
                                  disabled={rowPending}
                                  onClick={() => reviewEvent(item.id, "discarded")}
                                >
                                  Descartar
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : section === "history" ? (
        <>
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
              <div className="head-actions">
                <input
                  type="search"
                  className="search-input"
                  placeholder="Buscar cliente…"
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  aria-label="Buscar cliente"
                />
                <button className="ghost" onClick={exportCsv} disabled={isPending("csv")}>
                  Exportar CSV
                </button>
              </div>
            </div>
            {loading ? (
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    <SkeletonRows rows={4} cols={6} />
                  </tbody>
                </table>
              </div>
            ) : incomeClients.length === 0 ? (
              <p className="muted">Sin clientes en el periodo seleccionado.</p>
            ) : visibleIncomeClients.length === 0 ? (
              <p className="muted">Ningún cliente coincide con «{historyQuery}».</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">
                    Clases, horas e importe por cliente en el periodo
                  </caption>
                  <thead>
                    <tr>
                      <SortableTh
                        label="Cliente"
                        sortKey="name"
                        sort={historySort}
                        onSort={handleHistorySort}
                      />
                      <SortableTh
                        label="Email"
                        sortKey="email"
                        sort={historySort}
                        onSort={handleHistorySort}
                      />
                      <SortableTh
                        label="Clases"
                        sortKey="classes"
                        sort={historySort}
                        onSort={handleHistorySort}
                        className="num"
                      />
                      <SortableTh
                        label="Importe"
                        sortKey="amount"
                        sort={historySort}
                        onSort={handleHistorySort}
                        className="num"
                      />
                      <th scope="col" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleIncomeClients.map((client) => (
                      <tr key={client.email}>
                        <td>{client.name}</td>
                        <td className="muted small">{client.email}</td>
                        <td className="num strong">{client.classes}</td>
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
              </div>
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
                  <div className="table-wrap">
                    <table className="table">
                      <caption className="sr-only">Clases registradas</caption>
                      <thead>
                        <tr>
                          <th scope="col">Fecha</th>
                          <th scope="col">Clase</th>
                          <th scope="col" className="num">
                            Duración
                          </th>
                          <th scope="col" className="num">
                            Tarifa
                          </th>
                          <th scope="col" className="num">
                            Importe
                          </th>
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
                            <td className="num">{money(row.rate)}</td>
                            <td className="num strong">{money(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      ) : section === "clients" ? (
        <>
          <section className="card">
            <div className="card-head">
              <h2>Clientes ({allClients.length})</h2>
              <div className="head-actions">
                <span className="muted small">
                  Clases e importe acumulados. La tarifa se edita al abrir el cliente.
                </span>
                <input
                  type="search"
                  className="search-input"
                  placeholder="Buscar cliente…"
                  value={clientsQuery}
                  onChange={(e) => setClientsQuery(e.target.value)}
                  aria-label="Buscar cliente"
                />
              </div>
            </div>
            {loading ? (
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    <SkeletonRows rows={4} cols={5} />
                  </tbody>
                </table>
              </div>
            ) : allClients.length === 0 ? (
              <div className="empty">
                <p className="muted">Aún no hay clientes.</p>
                <button onClick={() => setSection("import")}>Ir a Importación</button>
              </div>
            ) : visibleAllClients.length === 0 ? (
              <p className="muted">Ningún cliente coincide con «{clientsQuery}».</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">
                    Clientes con horas e importe acumulados
                  </caption>
                  <thead>
                    <tr>
                      <SortableTh
                        label="Nombre"
                        sortKey="name"
                        sort={clientsSort}
                        onSort={handleClientsSort}
                      />
                      <SortableTh
                        label="Email"
                        sortKey="email"
                        sort={clientsSort}
                        onSort={handleClientsSort}
                      />
                      <SortableTh
                        label="Clases"
                        sortKey="classes"
                        sort={clientsSort}
                        onSort={handleClientsSort}
                        className="num"
                      />
                      <SortableTh
                        label="Importe"
                        sortKey="amount"
                        sort={clientsSort}
                        onSort={handleClientsSort}
                        className="num"
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAllClients.map((client) => {
                      const open = selectedClient === client.email;
                      return (
                        <Fragment key={client.email}>
                          <tr
                            className="client-row"
                            tabIndex={0}
                            aria-expanded={open}
                            onClick={() =>
                              setSelectedClient((current) =>
                                current === client.email ? null : client.email,
                              )
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedClient((current) =>
                                  current === client.email ? null : client.email,
                                );
                              }
                            }}
                          >
                            <td onClick={(event) => event.stopPropagation()}>
                              <ClientNameInput
                                value={client.name}
                                placeholder={client.email}
                                disabled={isPending(`name:${client.email}`)}
                                onCommit={(name) => changeClientName(client.email, name)}
                              />
                            </td>
                            <td className="muted small">{client.email}</td>
                            <td className="num strong">{client.classes}</td>
                            <td className="num strong">{money(client.amount)}</td>
                          </tr>
                          {open && (
                            <tr className="row-detail">
                              <td colSpan={4}>
                                <div className="detail-head">
                                  <h3>Clases de {client.name}</h3>
                                </div>
                                <RateHistoryEditor
                                  email={client.email}
                                  currency={rates.currency}
                                  defaultRate={rates.default_rate}
                                  notify={pushToast}
                                  onChanged={() => {
                                    void loadData({ silent: true });
                                    void reloadClientClasses(client.email);
                                  }}
                                />
                                {clientClasses.length === 0 ? (
                                  <p className="muted">Sin clases registradas.</p>
                                ) : (
                                  <table className="table">
                                    <caption className="sr-only">Clases registradas</caption>
                                    <thead>
                                      <tr>
                                        <th scope="col">Fecha</th>
                                        <th scope="col">Clase</th>
                                        <th scope="col" className="num">
                                          Duración
                                        </th>
                                        <th scope="col" className="num">
                                          Tarifa
                                        </th>
                                        <th scope="col" className="num">
                                          Importe
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {clientClasses.map((row) => (
                                        <tr key={row.id}>
                                          <td>{formatDateTime(row.start_ts)}</td>
                                          <td>{row.summary ?? "(sin título)"}</td>
                                          <td className="num">
                                            {row.duration_min != null
                                              ? `${row.duration_min} min`
                                              : "—"}
                                          </td>
                                          <td className="num">{money(row.rate)}</td>
                                          <td className="num strong">{money(row.amount)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="card">
            <div className="card-head">
              <h2>Tarifas</h2>
              {isPending("rates") && <span className="muted small">Guardando…</span>}
            </div>
            <div className="settings-form">
              <div className="field">
                <label>Tarifa normal (1 persona)</label>
                <InlineNumberValue
                  value={rates.default_rate}
                  symbol={rates.currency}
                  disabled={isPending("rates")}
                  onCommit={(value) => persistRates({ default_rate: value })}
                />
              </div>
              <div className="field">
                <label>Tarifa compartida (por alumno)</label>
                <InlineNumberValue
                  value={rates.shared_rate}
                  symbol={rates.currency}
                  disabled={isPending("rates")}
                  onCommit={(value) => persistRates({ shared_rate: value })}
                />
              </div>
              <div className="field">
                <label>Símbolo</label>
                <InlineTextValue
                  value={rates.currency}
                  placeholder="€"
                  disabled={isPending("rates")}
                  onCommit={(value) => persistRates({ currency: value })}
                />
              </div>
              <p className="muted small settings-note">
                El cobro es siempre por clase. Las clases con más de un invitado usan la tarifa
                compartida (por alumno). La tarifa individual de cada cliente se edita al
                desplegarlo en la sección Clientes.
              </p>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Copia de seguridad</h2>
              <div className="head-actions">
                <button
                  className="ghost"
                  onClick={exportBackup}
                  disabled={isPending("backup")}
                >
                  Exportar todo
                </button>
                <button
                  className="ghost"
                  onClick={importBackup}
                  disabled={isPending("backup")}
                >
                  Importar…
                </button>
              </div>
            </div>
            <p className="muted small">
              Exporta todos los datos (clases, clientes, tarifas y ajustes) a un archivo JSON, o
              restaura una copia anterior. La importación reemplaza los datos actuales.
            </p>
          </section>
        </>
      )}
      </div>
    </div>
  );
}

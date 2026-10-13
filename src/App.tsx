import { getVersion } from "@tauri-apps/api/app";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AccountMenu } from "./components/AccountMenu";
import { Brand } from "./components/Brand";
import { useConfirm } from "./components/ConfirmDialog";
import { ConnectScreen } from "./components/ConnectScreen";
import { DateRangePicker } from "./components/DateRangePicker";
import { InvoiceDialog } from "./components/InvoiceDialog";
import { HistoryIcon, ImportIcon, ReceiptIcon, SettingsIcon, UsersIcon } from "./components/icons";
import { SetupScreen } from "./components/SetupScreen";
import { BillingSection } from "./components/sections/BillingSection";
import { ClientsSection } from "./components/sections/ClientsSection";
import { HistorySection } from "./components/sections/HistorySection";
import { ImportSection } from "./components/sections/ImportSection";
import { SettingsSection } from "./components/sections/SettingsSection";
import { Toasts, useToasts } from "./components/Toasts";
import { UpdateBanner } from "./components/UpdateBanner";
import {
  type AppStatus,
  api,
  type CalendarEntry,
  type ClassDetail,
  type ClassGroup,
  type ClientIncome,
  type InvoiceRecord,
  type InvoiceSettings,
  type MonthlyIncome,
  type RatesConfig,
} from "./lib/api";
import { type DateRange, formatMonth } from "./lib/dates";
import { downloadCsv } from "./lib/download";
import { formatMoney } from "./lib/format";
import { nextSort, type SortKey, type SortState, sortClients } from "./lib/sorting";
import { useTheme } from "./lib/useTheme";
import { useUpdater } from "./lib/useUpdater";
import {
  currentYearMonth,
  DEFAULT_SECTION_ORDER,
  deltaClass,
  formatDelta,
  isRange,
  monthRange,
  normalizeSectionOrder,
  SECTION_LABELS,
  type Section,
  shiftMonth,
  singleMonthOf,
} from "./lib/view";
import "./App.css";

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

const SECTION_ICONS: Record<Section, typeof HistoryIcon> = {
  import: ImportIcon,
  history: HistoryIcon,
  clients: UsersIcon,
  settings: SettingsIcon,
  billing: ReceiptIcon,
};

const ALL_FROM = "2000-01-01";
const ALL_TO = "2999-12-31";

function Main({ status, onDisconnect }: { status: AppStatus; onDisconnect: () => void }) {
  const [section, setSection] = useState<Section>("history");
  const [sectionOrder, setSectionOrder] = useState<Section[]>(DEFAULT_SECTION_ORDER);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [importRange, setImportRange] = useState<DateRange>(() => monthRange(currentYearMonth()));
  const [historyRange, setHistoryRange] = useState<DateRange>(() => monthRange(currentYearMonth()));
  const [viewLoaded, setViewLoaded] = useState(false);

  const [rates, setRates] = useState<RatesConfig>({
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
  const { confirm, dialog: confirmDialog } = useConfirm();
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
  const { theme, changeTheme } = useTheme();
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
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>({
    name: "",
    tax_id: "",
    address: "",
    email: "",
    phone: "",
  });
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [savingIssuer, setSavingIssuer] = useState(false);
  const [exportingInvoiceId, setExportingInvoiceId] = useState<number | null>(null);
  const [invoiceEmail, setInvoiceEmail] = useState<string | null>(null);

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
    function handleReauth() {
      setNeedsReauth(true);
    }
    window.addEventListener("facturita:reauth", handleReauth);
    return () => window.removeEventListener("facturita:reauth", handleReauth);
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-mide las pestañas para animar tras reordenarlas
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

  const handleHistorySort = (key: SortKey) => setHistorySort((current) => nextSort(current, key));
  const handleClientsSort = (key: SortKey) => setClientsSort((current) => nextSort(current, key));

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
            importRange: DateRange;
            historyRange: DateRange;
            selectedMonth: string;
            custom: boolean;
            customFrom: string;
            customTo: string;
            syncCollapsed: boolean;
            sectionOrder: unknown;
          }>;
          const savedOrder = normalizeSectionOrder(saved.sectionOrder);
          if (savedOrder) setSectionOrder(savedOrder);
          setSection((savedOrder ?? DEFAULT_SECTION_ORDER)[0]);
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
        JSON.stringify({ importRange, historyRange, syncCollapsed, sectionOrder }),
      )
      .catch(() => undefined);
  }, [viewLoaded, importRange, historyRange, syncCollapsed, sectionOrder]);

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

  const reloadInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      setInvoices(await api.listInvoices());
    } catch (err) {
      setError(String(err));
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  useEffect(() => {
    api
      .getInvoiceSettings()
      .then(setInvoiceSettings)
      .catch(() => undefined);
    void reloadInvoices();
  }, [reloadInvoices]);

  async function saveIssuerSettings(settings: InvoiceSettings) {
    setSavingIssuer(true);
    try {
      await api.setInvoiceSettings(settings);
      setInvoiceSettings(settings);
      pushToast("success", "Datos de facturación guardados.");
    } catch (err) {
      setError(String(err));
      throw err;
    } finally {
      setSavingIssuer(false);
    }
  }

  async function exportInvoice(id: number) {
    setExportingInvoiceId(id);
    try {
      const path = await api.exportSavedInvoice(id);
      if (path) pushToast("success", `Factura guardada en ${path}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setExportingInvoiceId(null);
    }
  }

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
    const updated = calendars.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c));
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
        await api.setRatesConfig(next.default_rate, next.shared_rate, next.currency);
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
        await api.setClientName(email, name?.trim() ? name.trim() : null);
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
    const ok = await confirm({
      title: "Desconectar de Google",
      message: "Se cerrará la sesión de Google. Podrás volver a conectar cuando quieras.",
      confirmLabel: "Desconectar",
      danger: true,
    });
    if (!ok) return;
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
    return withPending("backup", async () => {
      const ok = await confirm({
        title: "Restaurar copia de seguridad",
        message:
          "Se reemplazarán TODOS los datos actuales (clases, clientes, tarifas y ajustes) por los de la copia. Esta acción no se puede deshacer.",
        confirmLabel: "Restaurar",
        danger: true,
      });
      if (!ok) return;
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

  return (
    <div className="app">
      <header className="appbar">
        <Brand />
        <nav className="tabs" ref={tabsRef}>
          {sectionOrder.map((value, index) => {
            const Icon = SECTION_ICONS[value];
            return (
              <button
                key={value}
                type="button"
                data-section={value}
                className={
                  "tab" +
                  (section === value ? " active" : "") +
                  (dragIndex === index ? " dragging" : "")
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
                <Icon size={16} />
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
            );
          })}
        </nav>
        <div className="appbar-actions">
          <AccountMenu
            email={status.email}
            open={menuOpen}
            onToggle={() => setMenuOpen((open) => !open)}
            theme={theme}
            onThemeChange={changeTheme}
            updater={updater}
            onCheckUpdates={() => void checkForUpdates()}
            onDisconnect={() => {
              setMenuOpen(false);
              void disconnect();
            }}
            version={appVersion}
            containerRef={menuRef}
          />
        </div>
      </header>

      <div className="sheet">
        <Toasts toasts={toasts} onDismiss={dismissToast} />
        <UpdateBanner updater={updater} />
        {confirmDialog}
        {section === "history" && (
          <section className="card controls">
            <div className="field">
              {/* biome-ignore lint/a11y/noLabelWithoutControl: etiqueta para un selector de rango personalizado */}
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
                <DateRangePicker value={historyRange} onChange={setHistoryRange} presets />
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
            <span>
              Tu sesión de Google caducó o fue revocada. Vuelve a conectar para continuar.
            </span>
            <button type="button" onClick={reconnect} disabled={busy}>
              {busy ? "Conectando…" : "Reconectar con Google"}
            </button>
          </div>
        )}

        <div className="section-body" key={section}>
          {section === "import" && (
            <ImportSection
              onboardingDismissed={onboardingDismissed}
              noClients={allClients.length === 0}
              onDismissOnboarding={dismissOnboarding}
              syncCollapsed={syncCollapsed}
              onToggleSyncCollapsed={() => setSyncCollapsed((value) => !value)}
              importRange={importRange}
              onImportRangeChange={setImportRange}
              selectedCalendarCount={selectedIds.length}
              lastSync={status.last_sync}
              calendars={calendars}
              onToggleCalendar={toggleCalendar}
              onSync={sync}
              busy={busy}
              classes={classes}
              visibleClasses={visibleClasses}
              loading={loading}
              pendingCount={pendingCount}
              classFilter={classFilter}
              onClassFilterChange={setClassFilter}
              selectedEvents={selectedEvents}
              selectedVisibleCount={selectedVisibleCount}
              isPending={isPending}
              onReviewEvent={reviewEvent}
              onReviewSelected={reviewSelected}
              onToggleEventSelection={toggleEventSelection}
              onToggleSelectVisible={toggleSelectVisible}
              onClearSelection={() => setSelectedEvents(new Set())}
              onAcceptImport={acceptImport}
              money={money}
              confirm={confirm}
            />
          )}
          {section === "history" && (
            <HistorySection
              incomeMonths={incomeMonths}
              currency={rates.currency}
              loading={loading}
              incomeClients={incomeClients}
              visibleIncomeClients={visibleIncomeClients}
              historyQuery={historyQuery}
              onHistoryQueryChange={setHistoryQuery}
              historySort={historySort}
              onSort={handleHistorySort}
              onExportCsv={exportCsv}
              csvPending={isPending("csv")}
              expanded={expanded}
              onToggleExpanded={(email) =>
                setExpanded((current) => (current === email ? null : email))
              }
              detail={detail}
              money={money}
              sharedRate={rates.shared_rate}
              defaultRate={rates.default_rate}
            />
          )}
          {section === "clients" && (
            <ClientsSection
              allClients={allClients}
              visibleAllClients={visibleAllClients}
              loading={loading}
              clientsQuery={clientsQuery}
              onClientsQueryChange={setClientsQuery}
              clientsSort={clientsSort}
              onSort={handleClientsSort}
              selectedClient={selectedClient}
              onToggleClient={(email) =>
                setSelectedClient((current) => (current === email ? null : email))
              }
              isPending={isPending}
              onChangeClientName={changeClientName}
              currency={rates.currency}
              defaultRate={rates.default_rate}
              notify={pushToast}
              onRatesChanged={() => void loadData({ silent: true })}
              onClientClassesReload={(email) => void reloadClientClasses(email)}
              clientClasses={clientClasses}
              money={money}
              onGoToImport={() => setSection("import")}
              onInvoice={(email) => setInvoiceEmail(email)}
            />
          )}
          {section === "settings" && (
            <SettingsSection
              rates={rates}
              pending={isPending("rates")}
              onPersistRates={persistRates}
              onExportBackup={exportBackup}
              onImportBackup={importBackup}
            />
          )}
          {section === "billing" && (
            <BillingSection
              settings={invoiceSettings}
              saving={savingIssuer}
              onSaveSettings={(settings) => void saveIssuerSettings(settings)}
              invoices={invoices}
              loading={invoicesLoading}
              onExportInvoice={(id) => void exportInvoice(id)}
              exportingId={exportingInvoiceId}
            />
          )}
        </div>
      </div>

      {invoiceEmail && (
        <InvoiceDialog
          email={invoiceEmail}
          issuer={invoiceSettings}
          onSaveIssuer={saveIssuerSettings}
          onIssued={() => void reloadInvoices()}
          notify={pushToast}
          onClose={() => setInvoiceEmail(null)}
        />
      )}
    </div>
  );
}

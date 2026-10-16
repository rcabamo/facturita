import { useCallback, useEffect, useMemo, useState } from "react";
import { AccountMenu } from "./components/AccountMenu";
import { Brand } from "./components/Brand";
import { useConfirm } from "./components/ConfirmDialog";
import { ConnectScreen } from "./components/ConnectScreen";
import { HistoryControls } from "./components/HistoryControls";
import { InvoiceDialog } from "./components/InvoiceDialog";
import { OnboardingTour } from "./components/OnboardingTour";
import { SetupScreen } from "./components/SetupScreen";
import { BillingSection } from "./components/sections/BillingSection";
import { ClientsSection } from "./components/sections/ClientsSection";
import { HistorySection } from "./components/sections/HistorySection";
import { ImportSection } from "./components/sections/ImportSection";
import { SettingsSection } from "./components/sections/SettingsSection";
import { TabBar } from "./components/TabBar";
import { Toasts, useToasts } from "./components/Toasts";
import { UpdateBanner } from "./components/UpdateBanner";
import { type AppStatus, api } from "./lib/api";
import { downloadCsv } from "./lib/download";
import { nextSort, type SortKey, type SortState, sortClients } from "./lib/sorting";
import { useAppChrome } from "./lib/useAppChrome";
import { useClientsPanel } from "./lib/useClientsPanel";
import { useDashboardData, usePrevMonthTotals } from "./lib/useDashboardData";
import { useImportReview } from "./lib/useImportReview";
import { useInvoices } from "./lib/useInvoices";
import { useOnboardingTour } from "./lib/useOnboardingTour";
import { usePendingTasks } from "./lib/usePendingTasks";
import { useRates } from "./lib/useRates";
import { useViewState } from "./lib/useViewState";
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

function Main({ status, onDisconnect }: { status: AppStatus; onDisconnect: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [historySort, setHistorySort] = useState<SortState>({ key: "amount", dir: "desc" });
  const [clientsSort, setClientsSort] = useState<SortState>({ key: "name", dir: "asc" });
  const [historyQuery, setHistoryQuery] = useState("");
  const [clientsQuery, setClientsQuery] = useState("");
  const [autoSync, setAutoSync] = useState(true);

  const { isPending, withPending } = usePendingTasks();
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const chrome = useAppChrome();
  const view = useViewState();
  const tour = useOnboardingTour();

  const { from, to } = view.historyRange;

  const data = useDashboardData({ from, to, setError });
  const prevTotals = usePrevMonthTotals(view.section, view.historyRange);
  const rates = useRates({ setError, withPending, pushToast, loadData: data.loadData });
  const importReview = useImportReview({
    importRange: view.importRange,
    classes: data.classes,
    viewLoaded: view.viewLoaded,
    autoSync,
    loadData: data.loadData,
    setError,
    setBusy,
    withPending,
    pushToast,
  });
  const clients = useClientsPanel({
    from,
    to,
    loadData: data.loadData,
    setError,
    withPending,
    pushToast,
  });
  const invoices = useInvoices({ setError, pushToast });

  useEffect(() => {
    if (!view.viewLoaded) return;
    void data.loadData();
  }, [data.loadData, view.viewLoaded]);

  useEffect(() => {
    if (tour.canAutoStart && view.viewLoaded) tour.start();
  }, [tour.canAutoStart, tour.start, view.viewLoaded]);

  useEffect(() => {
    api
      .getSettingValue("auto_sync")
      .then((value) => {
        if (value !== null) setAutoSync(value === "1");
      })
      .catch(() => undefined);
  }, []);

  const totalClasses = useMemo(
    () => data.incomeMonths.reduce((sum, m) => sum + m.classes, 0),
    [data.incomeMonths],
  );
  const totalIncome = useMemo(
    () => data.incomeMonths.reduce((sum, m) => sum + m.amount, 0),
    [data.incomeMonths],
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

  const visibleIncomeClients = useMemo(
    () => sortClients(data.incomeClients, historySort, historyQuery),
    [data.incomeClients, historySort, historyQuery],
  );

  const visibleAllClients = useMemo(
    () => sortClients(data.allClients, clientsSort, clientsQuery),
    [data.allClients, clientsSort, clientsQuery],
  );

  const handleHistorySort = (key: SortKey) => setHistorySort((current) => nextSort(current, key));
  const handleClientsSort = (key: SortKey) => setClientsSort((current) => nextSort(current, key));

  const changeAutoSync = useCallback((value: boolean) => {
    setAutoSync(value);
    void api.setSettingValue("auto_sync", value ? "1" : "0").catch(() => undefined);
  }, []);

  async function checkForUpdates() {
    chrome.setMenuOpen(false);
    const result = await chrome.updater.checkNow();
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
        const csv = await api.exportCsv(from, to, clients.expanded);
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
      chrome.setNeedsReauth(false);
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
          clients.setSelectedClient(null);
          clients.setExpanded(null);
          await data.loadData();
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
        <TabBar
          section={view.section}
          sectionOrder={view.sectionOrder}
          dragIndex={view.dragIndex}
          tabsRef={view.tabsRef}
          pendingTotal={data.pendingTotal}
          onSelect={(value) => {
            if (view.suppressTabClick.current) return;
            view.setSection(value);
          }}
          onMoveSection={view.moveSection}
          onPointerDown={view.handleTabPointerDown}
        />
        <div className="appbar-actions">
          <AccountMenu
            email={status.email}
            open={chrome.menuOpen}
            onToggle={() => chrome.setMenuOpen((open) => !open)}
            theme={chrome.theme}
            onThemeChange={chrome.changeTheme}
            updater={chrome.updater}
            onCheckUpdates={() => void checkForUpdates()}
            onShowTour={() => {
              chrome.setMenuOpen(false);
              tour.start();
            }}
            onDisconnect={() => {
              chrome.setMenuOpen(false);
              void disconnect();
            }}
            version={chrome.appVersion}
            containerRef={chrome.menuRef}
          />
        </div>
      </header>

      <div className="sheet">
        <Toasts toasts={toasts} onDismiss={dismissToast} />
        <UpdateBanner updater={chrome.updater} />
        {confirmDialog}
        {view.section === "history" && (
          <HistoryControls
            range={view.historyRange}
            onRangeChange={view.setHistoryRange}
            totalClasses={totalClasses}
            studentCount={data.incomeClients.length}
            totalIncome={totalIncome}
            money={rates.money}
            prevTotals={prevTotals}
            prevDelta={prevDelta}
          />
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

        {chrome.needsReauth && (
          <div className="alert warn" role="alert">
            <span>
              Tu sesión de Google caducó o fue revocada. Vuelve a conectar para continuar.
            </span>
            <button type="button" onClick={reconnect} disabled={busy}>
              {busy ? "Conectando…" : "Reconectar con Google"}
            </button>
          </div>
        )}

        <div className="section-body" key={view.section}>
          {view.section === "import" && (
            <ImportSection
              syncCollapsed={view.syncCollapsed}
              onToggleSyncCollapsed={() => view.setSyncCollapsed((value) => !value)}
              importRange={view.importRange}
              onImportRangeChange={view.setImportRange}
              selectedCalendarCount={importReview.selectedIds.length}
              lastSync={status.last_sync}
              calendars={importReview.calendars}
              onToggleCalendar={importReview.toggleCalendar}
              onSync={importReview.sync}
              busy={busy}
              classes={data.classes}
              visibleClasses={importReview.visibleClasses}
              loading={data.loading}
              pendingCount={importReview.pendingCount}
              staleCount={importReview.staleCount}
              autoSyncing={importReview.autoSyncing}
              classFilter={importReview.classFilter}
              onClassFilterChange={importReview.setClassFilter}
              selectedEvents={importReview.selectedEvents}
              selectedVisibleCount={importReview.selectedVisibleCount}
              isPending={isPending}
              onReviewEvent={importReview.reviewEvent}
              onReviewSelected={importReview.reviewSelected}
              onToggleEventSelection={importReview.toggleEventSelection}
              onToggleSelectVisible={importReview.toggleSelectVisible}
              onClearSelection={importReview.clearSelection}
              onAcceptImport={importReview.acceptImport}
              money={rates.money}
              confirm={confirm}
            />
          )}
          {view.section === "history" && (
            <HistorySection
              incomeMonths={data.incomeMonths}
              currency={rates.rates.currency}
              loading={data.loading}
              incomeClients={data.incomeClients}
              visibleIncomeClients={visibleIncomeClients}
              historyQuery={historyQuery}
              onHistoryQueryChange={setHistoryQuery}
              historySort={historySort}
              onSort={handleHistorySort}
              onExportCsv={exportCsv}
              csvPending={isPending("csv")}
              expanded={clients.expanded}
              onToggleExpanded={clients.toggleExpanded}
              detail={clients.detail}
              money={rates.money}
              sharedRate={rates.rates.shared_rate}
              defaultRate={rates.rates.default_rate}
            />
          )}
          {view.section === "clients" && (
            <ClientsSection
              allClients={data.allClients}
              visibleAllClients={visibleAllClients}
              loading={data.loading}
              clientsQuery={clientsQuery}
              onClientsQueryChange={setClientsQuery}
              clientsSort={clientsSort}
              onSort={handleClientsSort}
              selectedClient={clients.selectedClient}
              onToggleClient={clients.toggleClient}
              isPending={isPending}
              onChangeClientName={clients.changeClientName}
              currency={rates.rates.currency}
              defaultRate={rates.rates.default_rate}
              notify={pushToast}
              onRatesChanged={() => void data.loadData({ silent: true })}
              onClientClassesReload={(email) => void clients.reloadClientClasses(email)}
              clientClasses={clients.clientClasses}
              money={rates.money}
              onGoToImport={() => view.setSection("import")}
              onInvoice={(email) => invoices.setInvoiceEmail(email)}
            />
          )}
          {view.section === "settings" && (
            <SettingsSection
              rates={rates.rates}
              pending={isPending("rates")}
              autoSync={autoSync}
              onChangeAutoSync={changeAutoSync}
              onPersistRates={rates.persistRates}
              onExportBackup={exportBackup}
              onImportBackup={importBackup}
            />
          )}
          {view.section === "billing" && (
            <BillingSection
              settings={invoices.invoiceSettings}
              saving={invoices.savingIssuer}
              onSaveSettings={(settings) => void invoices.saveIssuerSettings(settings)}
              invoices={invoices.invoices}
              loading={invoices.invoicesLoading}
              onExportInvoice={(id) => void invoices.exportInvoice(id)}
              exportingId={invoices.exportingInvoiceId}
            />
          )}
        </div>
      </div>

      {invoices.invoiceEmail && (
        <InvoiceDialog
          email={invoices.invoiceEmail}
          issuer={invoices.invoiceSettings}
          onSaveIssuer={invoices.saveIssuerSettings}
          onIssued={() => void invoices.reloadInvoices()}
          notify={pushToast}
          onClose={() => invoices.setInvoiceEmail(null)}
        />
      )}

      <OnboardingTour open={tour.open} onNavigate={view.setSection} onFinish={tour.finish} />
    </div>
  );
}

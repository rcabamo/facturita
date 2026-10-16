import { useEffect, useMemo, useRef, useState } from "react";
import { api, type CalendarEntry, type ClassGroup } from "./api";
import type { DateRange } from "./dates";
import {
  ALL_FROM,
  ALL_TO,
  type ClassFilter,
  currentYearMonth,
  monthRange,
  type Review,
} from "./view";

export function useImportReview({
  importRange,
  classes,
  viewLoaded,
  autoSync,
  loadData,
  setError,
  setBusy,
  withPending,
  pushToast,
}: {
  importRange: DateRange;
  classes: ClassGroup[];
  viewLoaded: boolean;
  autoSync: boolean;
  loadData: (options?: { silent?: boolean }) => Promise<void>;
  setError: (message: string | null) => void;
  setBusy: (busy: boolean) => void;
  withPending: (key: string, action: () => Promise<void>) => Promise<void>;
  pushToast: (kind: "success" | "error" | "info", message: string) => void;
}) {
  const [calendars, setCalendars] = useState<CalendarEntry[]>([]);
  const [calendarsLoaded, setCalendarsLoaded] = useState(false);
  const [classFilter, setClassFilter] = useState<ClassFilter>("pending");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(() => new Set());
  const [autoSyncing, setAutoSyncing] = useState(false);
  const autoSynced = useRef(false);

  useEffect(() => {
    api
      .listCalendars()
      .then(setCalendars)
      .catch((err) => setError(String(err)))
      .finally(() => setCalendarsLoaded(true));
  }, [setError]);

  const selectedIds = useMemo(
    () => calendars.filter((c) => c.selected).map((c) => c.id),
    [calendars],
  );

  const pendingCount = useMemo(
    () => classes.filter((c) => !c.accepted && !c.discarded && !c.stale).length,
    [classes],
  );

  const staleCount = useMemo(
    () => classes.filter((c) => c.stale && !c.discarded).length,
    [classes],
  );

  const visibleClasses = useMemo(() => {
    switch (classFilter) {
      case "pending":
        return classes.filter((c) => !c.accepted && !c.discarded && !c.stale);
      case "accepted":
        return classes.filter((c) => c.accepted && !c.discarded && !c.stale);
      case "discarded":
        return classes.filter((c) => c.discarded);
      case "stale":
        return classes.filter((c) => c.stale && !c.discarded);
      default:
        return classes;
    }
  }, [classes, classFilter]);

  // Sincroniza el mes en curso al abrir la app (una sola vez por sesión) y
  // marca como `stale` las clases que ya no aparecen en Google.
  useEffect(() => {
    if (!autoSync || !viewLoaded || !calendarsLoaded || autoSynced.current) return;
    autoSynced.current = true;
    void (async () => {
      setAutoSyncing(true);
      try {
        const range = monthRange(currentYearMonth());
        const summary = await api.syncEvents(selectedIds, range.from, range.to);
        if (summary.stale > 0) {
          pushToast(
            "info",
            `${summary.stale} clase${summary.stale === 1 ? "" : "s"} ya no aparece${
              summary.stale === 1 ? "" : "n"
            } en Google. Revísala${summary.stale === 1 ? "" : "s"} en Importación.`,
          );
        }
        if (summary.classes > 0 || summary.stale > 0) {
          await loadData({ silent: true });
        }
      } catch (err) {
        if (!String(err).includes("REAUTH_REQUIRED")) {
          pushToast("error", `No se pudo sincronizar: ${String(err)}`);
        }
      } finally {
        setAutoSyncing(false);
      }
    })();
  }, [autoSync, viewLoaded, calendarsLoaded, selectedIds, loadData, pushToast]);

  const selectedVisibleCount = useMemo(
    () => visibleClasses.filter((item) => selectedEvents.has(item.id)).length,
    [visibleClasses, selectedEvents],
  );

  async function toggleCalendar(id: string) {
    const updated = calendars.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c));
    setCalendars(updated);
    try {
      await api.setSelectedCalendars(updated.filter((c) => c.selected).map((c) => c.id));
    } catch (err) {
      setError(String(err));
    }
  }

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

  function reviewEvent(id: string, review: Review) {
    return withPending(`review:${id}`, async () => {
      try {
        await api.setEventReview(id, review);
        await loadData();
      } catch (err) {
        setError(String(err));
      }
    });
  }

  function reviewSelected(review: Review) {
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

  function clearSelection() {
    setSelectedEvents(new Set());
  }

  return {
    calendars,
    selectedIds,
    toggleCalendar,
    classFilter,
    setClassFilter,
    selectedEvents,
    visibleClasses,
    pendingCount,
    staleCount,
    autoSyncing,
    selectedVisibleCount,
    sync,
    acceptImport,
    reviewEvent,
    reviewSelected,
    toggleEventSelection,
    toggleSelectVisible,
    clearSelection,
  };
}

import { useEffect, useMemo, useState } from "react";
import { api, type CalendarEntry, type ClassGroup } from "./api";
import type { DateRange } from "./dates";
import { ALL_FROM, ALL_TO, type ClassFilter, type Review } from "./view";

export function useImportReview({
  importRange,
  classes,
  loadData,
  setError,
  setBusy,
  withPending,
  pushToast,
}: {
  importRange: DateRange;
  classes: ClassGroup[];
  loadData: (options?: { silent?: boolean }) => Promise<void>;
  setError: (message: string | null) => void;
  setBusy: (busy: boolean) => void;
  withPending: (key: string, action: () => Promise<void>) => Promise<void>;
  pushToast: (kind: "success" | "error" | "info", message: string) => void;
}) {
  const [calendars, setCalendars] = useState<CalendarEntry[]>([]);
  const [classFilter, setClassFilter] = useState<ClassFilter>("pending");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    api
      .listCalendars()
      .then(setCalendars)
      .catch((err) => setError(String(err)));
  }, [setError]);

  const selectedIds = useMemo(
    () => calendars.filter((c) => c.selected).map((c) => c.id),
    [calendars],
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

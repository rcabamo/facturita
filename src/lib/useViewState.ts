import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { api } from "./api";
import type { DateRange } from "./dates";
import {
  currentYearMonth,
  DEFAULT_SECTION_ORDER,
  isRange,
  monthRange,
  normalizeSectionOrder,
  type Section,
} from "./view";

export function useViewState() {
  const [section, setSection] = useState<Section>("history");
  const [sectionOrder, setSectionOrder] = useState<Section[]>(DEFAULT_SECTION_ORDER);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [importRange, setImportRange] = useState<DateRange>(() => monthRange(currentYearMonth()));
  const [historyRange, setHistoryRange] = useState<DateRange>(() => monthRange(currentYearMonth()));
  const [syncCollapsed, setSyncCollapsed] = useState(false);
  const [viewLoaded, setViewLoaded] = useState(false);
  const tabsRef = useRef<HTMLElement>(null);
  const suppressTabClick = useRef(false);
  const tabPositions = useRef<Map<string, number>>(new Map());

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
    (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
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
    void api
      .setSettingValue(
        "view_state",
        JSON.stringify({ importRange, historyRange, syncCollapsed, sectionOrder }),
      )
      .catch(() => undefined);
  }, [viewLoaded, importRange, historyRange, syncCollapsed, sectionOrder]);

  return {
    section,
    setSection,
    sectionOrder,
    dragIndex,
    tabsRef,
    suppressTabClick,
    handleTabPointerDown,
    moveSection,
    importRange,
    setImportRange,
    historyRange,
    setHistoryRange,
    syncCollapsed,
    setSyncCollapsed,
    viewLoaded,
  };
}

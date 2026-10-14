import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { SECTION_LABELS, type Section } from "../lib/view";
import { HistoryIcon, ImportIcon, ReceiptIcon, SettingsIcon, UsersIcon } from "./icons";

const SECTION_ICONS: Record<Section, typeof HistoryIcon> = {
  import: ImportIcon,
  history: HistoryIcon,
  clients: UsersIcon,
  settings: SettingsIcon,
  billing: ReceiptIcon,
};

export function TabBar({
  section,
  sectionOrder,
  dragIndex,
  tabsRef,
  pendingTotal,
  onSelect,
  onMoveSection,
  onPointerDown,
}: {
  section: Section;
  sectionOrder: Section[];
  dragIndex: number | null;
  tabsRef: RefObject<HTMLElement | null>;
  pendingTotal: number;
  onSelect: (value: Section) => void;
  onMoveSection: (from: number, to: number) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, index: number) => void;
}) {
  return (
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
            onPointerDown={(event) => onPointerDown(event, index)}
            onClick={() => onSelect(value)}
            onKeyDown={(event) => {
              if (!event.altKey) return;
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                onMoveSection(index, index - 1);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                onMoveSection(index, index + 1);
              }
            }}
            title="Arrastra para reordenar (Alt + ←/→)"
          >
            <Icon size={16} />
            {SECTION_LABELS[value]}
            {value === "import" && pendingTotal > 0 && (
              <span className="tab-badge" title={`${pendingTotal} clases pendientes de aceptar`}>
                {pendingTotal}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

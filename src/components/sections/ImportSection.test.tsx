import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CalendarEntry, ClassGroup } from "../../lib/api";
import { ImportSection } from "./ImportSection";

const classGroup: ClassGroup = {
  id: "e1",
  summary: "Clase de inglés",
  start_ts: "2024-03-05T10:00:00Z",
  end_ts: "2024-03-05T11:00:00Z",
  duration_min: 60,
  shared: false,
  accepted: false,
  discarded: false,
  total_amount: 30,
  clients: [{ email: "ana@x", name: "Ana", amount: 30 }],
};

const calendars: CalendarEntry[] = [
  { id: "cal1", summary: "Principal", primary: true, selected: true, access_role: "owner" },
];

function renderSection(overrides: Partial<Parameters<typeof ImportSection>[0]> = {}) {
  const props = {
    syncCollapsed: false,
    onToggleSyncCollapsed: vi.fn(),
    importRange: { from: "2024-03-01", to: "2024-03-31" },
    onImportRangeChange: vi.fn(),
    selectedCalendarCount: 1,
    lastSync: null,
    calendars,
    onToggleCalendar: vi.fn(),
    onSync: vi.fn(),
    busy: false,
    classes: [classGroup],
    visibleClasses: [classGroup],
    loading: false,
    pendingCount: 1,
    classFilter: "pending" as const,
    onClassFilterChange: vi.fn(),
    selectedEvents: new Set<string>(),
    selectedVisibleCount: 0,
    isPending: () => false,
    onReviewEvent: vi.fn(),
    onReviewSelected: vi.fn(),
    onToggleEventSelection: vi.fn(),
    onToggleSelectVisible: vi.fn(),
    onClearSelection: vi.fn(),
    onAcceptImport: vi.fn(),
    money: (value: number) => `${value} €`,
    confirm: vi.fn(async () => true),
    ...overrides,
  };
  render(<ImportSection {...props} />);
  return props;
}

describe("ImportSection", () => {
  it("gestiona el botón Aceptar todo según las pendientes", async () => {
    const user = userEvent.setup();
    const props = renderSection({ pendingCount: 2 });
    const button = screen.getByRole("button", { name: /Aceptar todo/ });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(props.onAcceptImport).toHaveBeenCalled();
  });

  it("deshabilita Aceptar todo sin pendientes", () => {
    renderSection({ pendingCount: 0 });
    expect(screen.getByRole("button", { name: /Aceptar todo/ })).toBeDisabled();
  });

  it("cambia el filtro por estado", async () => {
    const user = userEvent.setup();
    const props = renderSection();
    await user.click(screen.getByRole("button", { name: "Aceptadas" }));
    expect(props.onClassFilterChange).toHaveBeenCalledWith("accepted");
  });

  it("acepta o descarta una clase pendiente", async () => {
    const user = userEvent.setup();
    const props = renderSection();
    await user.click(screen.getByRole("button", { name: "Aceptar" }));
    expect(props.onReviewEvent).toHaveBeenCalledWith("e1", "accepted");
  });

  it("selecciona todas las clases visibles", async () => {
    const user = userEvent.setup();
    const props = renderSection();
    await user.click(
      screen.getByRole("checkbox", { name: "Seleccionar todas las clases visibles" }),
    );
    expect(props.onToggleSelectVisible).toHaveBeenCalled();
  });
});

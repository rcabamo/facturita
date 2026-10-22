import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CalendarEntry, ClassGroup } from "../../lib/api";
import { ImportSection } from "./ImportSection";

const classGroup: ClassGroup = {
  id: "e1",
  summary: "Clase de inglés",
  start_ts: "2024-03-05T10:00:00Z",
  start_local: "2024-03-05T10:00:00",
  end_ts: "2024-03-05T11:00:00Z",
  duration_min: 60,
  shared: false,
  accepted: false,
  discarded: false,
  stale: false,
  cancelled: false,
  included: false,
  total_amount: 30,
  clients: [{ email: "ana@x", name: "Ana", amount: 30, billable: true }],
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
    staleCount: 0,
    cancelledCount: 0,
    autoSyncing: false,
    classFilter: "pending" as const,
    onClassFilterChange: vi.fn(),
    selectedEvents: new Set<string>(),
    selectedVisibleCount: 0,
    isPending: () => false,
    onReviewEvent: vi.fn(),
    onSetEventBilling: vi.fn(),
    onSetCancelledIncluded: vi.fn(),
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

  it("muestra y descarta una clase que ya no aparece en Google", async () => {
    const user = userEvent.setup();
    const staleGroup = { ...classGroup, accepted: true, stale: true };
    const props = renderSection({
      classes: [staleGroup],
      visibleClasses: [staleGroup],
      classFilter: "stale",
      staleCount: 1,
    });
    expect(screen.getByText("Ya no aparece en Google")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Descartar" }));
    expect(props.onReviewEvent).toHaveBeenCalledWith("e1", "discarded");
  });

  it("restaura una clase descartada", async () => {
    const user = userEvent.setup();
    const discardedGroup = { ...classGroup, discarded: true };
    const props = renderSection({
      classes: [discardedGroup],
      visibleClasses: [discardedGroup],
    });
    await user.click(screen.getByRole("button", { name: "Restaurar" }));
    expect(props.onReviewEvent).toHaveBeenCalledWith("e1", "restored");
  });

  it("cambia una clase compartida a individual con un alumno", async () => {
    const user = userEvent.setup();
    const shared = {
      ...classGroup,
      shared: true,
      total_amount: 60,
      clients: [
        { email: "ana@x", name: "Ana", amount: 30, billable: true },
        { email: "padre@x", name: "Padre", amount: 30, billable: true },
      ],
    };
    const props = renderSection({ classes: [shared], visibleClasses: [shared] });
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Alumnos que cuentan/ }),
      "ana@x",
    );
    expect(props.onSetEventBilling).toHaveBeenCalledWith("e1", ["ana@x"]);
  });

  it("excluye a un invitado que no da clase pulsando su chip", async () => {
    const user = userEvent.setup();
    const shared = {
      ...classGroup,
      shared: true,
      total_amount: 60,
      clients: [
        { email: "ana@x", name: "Ana", amount: 30, billable: true },
        { email: "padre@x", name: "Padre", amount: 30, billable: true },
      ],
    };
    const props = renderSection({ classes: [shared], visibleClasses: [shared] });
    await user.click(screen.getByRole("button", { name: "Padre" }));
    expect(props.onSetEventBilling).toHaveBeenCalledWith("e1", ["ana@x"]);
  });

  it("filtra las clases canceladas", async () => {
    const user = userEvent.setup();
    const props = renderSection();
    await user.click(screen.getByRole("button", { name: "Canceladas" }));
    expect(props.onClassFilterChange).toHaveBeenCalledWith("cancelled");
  });

  it("incluye o excluye una clase cancelada en el cómputo", async () => {
    const user = userEvent.setup();
    const cancelled = { ...classGroup, cancelled: true, accepted: true };
    const props = renderSection({
      classes: [cancelled],
      visibleClasses: [cancelled],
      classFilter: "cancelled",
      cancelledCount: 1,
    });
    expect(screen.getByText("Cancelada en Google")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Incluir en el cómputo" }));
    expect(props.onSetCancelledIncluded).toHaveBeenCalledWith("e1", true);
  });

  it("permite dejar de incluir una clase cancelada", async () => {
    const user = userEvent.setup();
    const cancelled = { ...classGroup, cancelled: true, accepted: true, included: true };
    const props = renderSection({
      classes: [cancelled],
      visibleClasses: [cancelled],
      classFilter: "cancelled",
    });
    expect(screen.getByText("Cancelada · incluida")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "No incluir" }));
    expect(props.onSetCancelledIncluded).toHaveBeenCalledWith("e1", false);
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

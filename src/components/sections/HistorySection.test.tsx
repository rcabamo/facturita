import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ClassDetail, ClientIncome, MonthlyIncome } from "../../lib/api";
import { HistorySection } from "./HistorySection";

const months: MonthlyIncome[] = [{ month: "2024-03", classes: 3, amount: 90 }];
const clients: ClientIncome[] = [
  { email: "ana@x", name: "Ana", classes: 3, amount: 90, rate: null },
];

const detail: ClassDetail[] = [
  {
    id: "e1",
    summary: "Clase",
    start_ts: "2024-03-05T10:00:00Z",
    end_ts: "2024-03-05T11:00:00Z",
    duration_min: 60,
    email: "ana@x",
    name: "Ana",
    rate: 30,
    amount: 30,
  },
];

function renderSection(overrides: Partial<Parameters<typeof HistorySection>[0]> = {}) {
  const props = {
    incomeMonths: months,
    currency: "€",
    loading: false,
    incomeClients: clients,
    visibleIncomeClients: clients,
    historyQuery: "",
    onHistoryQueryChange: vi.fn(),
    historySort: { key: "amount", dir: "desc" } as const,
    onSort: vi.fn(),
    onExportCsv: vi.fn(),
    csvPending: false,
    expanded: null,
    onToggleExpanded: vi.fn(),
    detail: [],
    money: (value: number) => `${value} €`,
    sharedRate: 20,
    defaultRate: 30,
    ...overrides,
  };
  render(<HistorySection {...props} />);
  return props;
}

describe("HistorySection", () => {
  it("avisa cuando no hay datos en el periodo", () => {
    renderSection({ incomeMonths: [], incomeClients: [], visibleIncomeClients: [] });
    expect(screen.getByText("Sin datos en el periodo.")).toBeInTheDocument();
  });

  it("notifica los cambios de búsqueda y la exportación CSV", async () => {
    const user = userEvent.setup();
    const props = renderSection();

    await user.type(screen.getByRole("searchbox", { name: "Buscar cliente" }), "a");
    expect(props.onHistoryQueryChange).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Exportar CSV" }));
    expect(props.onExportCsv).toHaveBeenCalled();
  });

  it("ordena por la columna pulsada", async () => {
    const user = userEvent.setup();
    const props = renderSection();

    await user.click(screen.getByRole("button", { name: /Clases/ }));
    expect(props.onSort).toHaveBeenCalledWith("classes");
  });

  it("muestra el detalle del cliente expandido", () => {
    renderSection({ expanded: "ana@x", detail });
    expect(screen.getByRole("heading", { name: "Clases de Ana" })).toBeInTheDocument();
    expect(screen.getByText("60 min")).toBeInTheDocument();
  });
});

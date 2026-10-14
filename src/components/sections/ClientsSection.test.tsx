import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/api", async () => ({ api: (await import("../../test/mocks")).createApiMock() }));

import { api, type ClientIncome } from "../../lib/api";
import { ClientsSection } from "./ClientsSection";

const mocked = vi.mocked(api);

const clients: ClientIncome[] = [
  { email: "ana@x", name: "Ana", classes: 3, amount: 90, rate: null },
];

function renderSection(overrides: Partial<Parameters<typeof ClientsSection>[0]> = {}) {
  const props = {
    allClients: clients,
    visibleAllClients: clients,
    loading: false,
    clientsQuery: "",
    onClientsQueryChange: vi.fn(),
    clientsSort: { key: "name", dir: "asc" } as const,
    onSort: vi.fn(),
    selectedClient: null,
    onToggleClient: vi.fn(),
    isPending: () => false,
    onChangeClientName: vi.fn(),
    currency: "€",
    defaultRate: 30,
    notify: vi.fn(),
    onRatesChanged: vi.fn(),
    onClientClassesReload: vi.fn(),
    clientClasses: [],
    money: (value: number) => `${value} €`,
    onGoToImport: vi.fn(),
    onInvoice: vi.fn(),
    ...overrides,
  };
  render(<ClientsSection {...props} />);
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.clientRateHistory.mockResolvedValue([]);
});

describe("ClientsSection", () => {
  it("ofrece ir a Importación cuando no hay clientes", async () => {
    const user = userEvent.setup();
    const props = renderSection({ allClients: [], visibleAllClients: [] });

    expect(screen.getByText("Aún no hay clientes.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ir a Importación" }));
    expect(props.onGoToImport).toHaveBeenCalled();
  });

  it("alterna el cliente al pulsar su fila", async () => {
    const user = userEvent.setup();
    const props = renderSection();

    await user.click(screen.getByText("ana@x"));
    expect(props.onToggleClient).toHaveBeenCalledWith("ana@x");
  });

  it("permite emitir factura desde el cliente abierto", async () => {
    const user = userEvent.setup();
    const props = renderSection({ selectedClient: "ana@x" });

    await user.click(await screen.findByRole("button", { name: /Emitir factura/ }));
    expect(props.onInvoice).toHaveBeenCalledWith("ana@x");
  });
});

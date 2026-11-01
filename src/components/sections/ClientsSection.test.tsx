import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/api", async () => ({ api: (await import("../../test/mocks")).createApiMock() }));

import { api, type ClassDetail, type ClientIncome } from "../../lib/api";
import { ClientsSection } from "./ClientsSection";

const mocked = vi.mocked(api);

const clients: ClientIncome[] = [
  { email: "ana@x", name: "Ana", classes: 3, amount: 90, rate: null },
];

const classes: ClassDetail[] = [
  {
    id: "e1",
    summary: "Clase suelta",
    start_ts: "2024-03-05T10:00:00Z",
    start_local: "2024-03-05T11:00:00",
    end_ts: "2024-03-05T11:00:00Z",
    duration_min: 60,
    email: "ana@x",
    name: "Ana",
    rate: 30,
    amount: 30,
    invoice_id: null,
    invoice_number: null,
  },
  {
    id: "e2",
    summary: "Clase facturada",
    start_ts: "2024-03-07T10:00:00Z",
    start_local: "2024-03-07T11:00:00",
    end_ts: "2024-03-07T11:00:00Z",
    duration_min: 60,
    email: "ana@x",
    name: "Ana",
    rate: 30,
    amount: 30,
    invoice_id: 3,
    invoice_number: "2024-0003",
  },
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
    onOpenInvoice: vi.fn(),
    onNewClient: vi.fn(),
    onDeleteClient: vi.fn(),
    confirm: vi.fn(async () => true),
    ...overrides,
  };
  render(<ClientsSection {...props} />);
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.clientRateHistory.mockResolvedValue([]);
  mocked.getClientBilling.mockResolvedValue({
    legal_name: "",
    tax_id: "",
    address: "",
    language: "es",
  });
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

    expect(screen.getByRole("heading", { name: "Tarifa del cliente" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Emails del cliente" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clases" })).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /Emitir factura/ }));
    expect(props.onInvoice).toHaveBeenCalledWith("ana@x");
  });

  it("muestra un estado vacío mientras no se elige cliente", () => {
    renderSection();
    expect(screen.getByText("Selecciona un cliente")).toBeInTheDocument();
  });

  it("agrupa las clases por factura y abre la factura asociada", async () => {
    const user = userEvent.setup();
    const props = renderSection({ selectedClient: "ana@x", clientClasses: classes });

    expect(screen.getByText("Sin facturar")).toBeInTheDocument();
    expect(screen.getByText("Clase suelta")).toBeInTheDocument();

    const invoiceLink = screen.getByRole("button", { name: /Factura 2024-0003/ });
    await user.click(invoiceLink);
    expect(props.onOpenInvoice).toHaveBeenCalledWith(3);
  });

  it("abre el alta manual de cliente", async () => {
    const user = userEvent.setup();
    const props = renderSection();

    await user.click(screen.getByRole("button", { name: /Nuevo cliente/ }));
    expect(props.onNewClient).toHaveBeenCalled();
  });

  it("muestra el cliente manual por su nombre y permite eliminarlo", async () => {
    const user = userEvent.setup();
    const manual: ClientIncome = {
      email: "manual-acme",
      name: "Acme S.L.",
      classes: 0,
      amount: 0,
      rate: null,
      manual: true,
    };
    const props = renderSection({
      allClients: [manual],
      visibleAllClients: [manual],
      selectedClient: "manual-acme",
    });

    expect(screen.getAllByText("Acme S.L.").length).toBeGreaterThan(0);
    expect(screen.queryByText("manual-acme")).not.toBeInTheDocument();
    expect(screen.getByText("Cliente creado a mano")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Eliminar cliente manual/ }));
    expect(props.confirm).toHaveBeenCalled();
    expect(props.onDeleteClient).toHaveBeenCalledWith("manual-acme");
  });
});

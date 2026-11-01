import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api", async () => ({ api: (await import("../test/mocks")).createApiMock() }));

import { api, type InvoiceData, type InvoiceRecord } from "../lib/api";
import { InvoiceDetailModal } from "./InvoiceDetailModal";

const mocked = vi.mocked(api);

const invoice: InvoiceData = {
  number: "2024-0003",
  issued_on: "2024-04-01",
  period: "2024-03",
  currency: "€",
  issuer: {
    name: "Ada",
    tax_id: "12345678A",
    address: "",
    email: "",
    phone: null,
    bank_account: null,
  },
  client: {
    name: "Ana",
    email: "ana@x",
    tax_id: "87654321B",
    address: "Calle Mayor 1",
  },
  lines: [
    {
      date: "2024-03-05T10:00:00Z",
      concept: "Clase de inglés",
      duration_min: 60,
      rate: 30,
      amount: 30,
      event_id: "e1",
    },
  ],
  total: 30,
  lang: "en",
};

function record(overrides: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: 3,
    number: "2024-0003",
    issued_on: "2024-04-01",
    period: "2024-03",
    client_name: "Ana",
    client_email: "ana@x",
    total: 30,
    currency: "€",
    paid_on: null,
    voided: false,
    voided_ts: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.invoiceDetail.mockResolvedValue(invoice);
  mocked.listInvoices.mockResolvedValue([record()]);
  mocked.exportSavedInvoice.mockResolvedValue("/tmp/f.pdf");
  mocked.setInvoicePaid.mockResolvedValue(undefined);
  mocked.voidInvoice.mockResolvedValue(undefined);
  mocked.removeInvoiceLine.mockResolvedValue(undefined);
});

describe("InvoiceDetailModal", () => {
  it("muestra los datos, el idioma y las clases de la factura guardada", async () => {
    render(<InvoiceDetailModal id={3} notify={vi.fn()} onChanged={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: /Factura 2024-0003/ })).toBeInTheDocument();
    expect(screen.getByText("Clase de inglés")).toBeInTheDocument();
    expect(screen.getByText("NIF: 87654321B")).toBeInTheDocument();
    const language = screen.getByText(/Idioma/).closest("p");
    expect(language).toHaveTextContent("inglés");
    expect(screen.getByText("pendiente")).toBeInTheDocument();
    expect(mocked.invoiceDetail).toHaveBeenCalledWith(3);
  });

  it("vuelve a guardar el PDF y avisa", async () => {
    const user = userEvent.setup();
    const notify = vi.fn();
    render(<InvoiceDetailModal id={3} notify={notify} onChanged={vi.fn()} onClose={vi.fn()} />);

    await screen.findByText("Clase de inglés");
    await user.click(screen.getByRole("button", { name: /Guardar PDF/ }));

    expect(mocked.exportSavedInvoice).toHaveBeenCalledWith(3);
    expect(notify).toHaveBeenCalledWith("success", expect.stringContaining("/tmp/f.pdf"));
  });

  it("marca la factura como cobrada", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(<InvoiceDetailModal id={3} notify={vi.fn()} onChanged={onChanged} onClose={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Marcar cobrada" }));
    expect(mocked.setInvoicePaid).toHaveBeenCalledWith(3, true);
    expect(onChanged).toHaveBeenCalled();
  });

  it("anula la factura tras confirmar y conserva su número", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(<InvoiceDetailModal id={3} notify={vi.fn()} onChanged={onChanged} onClose={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Anular" }));
    const heading = await screen.findByRole("heading", { name: "Anular factura" });
    await user.click(
      within(heading.parentElement as HTMLElement).getByRole("button", { name: "Anular" }),
    );

    await waitFor(() => expect(mocked.voidInvoice).toHaveBeenCalledWith(3));
    expect(onChanged).toHaveBeenCalled();
    expect(screen.getAllByText("anulada").length).toBeGreaterThan(0);
  });

  it("quita una clase de la factura", async () => {
    const user = userEvent.setup();
    render(<InvoiceDetailModal id={3} notify={vi.fn()} onChanged={vi.fn()} onClose={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Quitar" }));
    const heading = await screen.findByRole("heading", { name: "Quitar clase de la factura" });
    await user.click(
      within(heading.parentElement as HTMLElement).getByRole("button", { name: "Quitar" }),
    );

    await waitFor(() => expect(mocked.removeInvoiceLine).toHaveBeenCalledWith(3, "e1"));
  });

  it("se cierra con Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<InvoiceDetailModal id={3} notify={vi.fn()} onChanged={vi.fn()} onClose={onClose} />);

    await screen.findByText("Clase de inglés");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});

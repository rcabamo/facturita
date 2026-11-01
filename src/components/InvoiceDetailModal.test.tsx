import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api", async () => ({ api: (await import("../test/mocks")).createApiMock() }));

import { api, type InvoiceData } from "../lib/api";
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
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.invoiceDetail.mockResolvedValue(invoice);
  mocked.exportSavedInvoice.mockResolvedValue("/tmp/f.pdf");
});

describe("InvoiceDetailModal", () => {
  it("muestra los datos y las clases de la factura guardada", async () => {
    render(<InvoiceDetailModal id={3} notify={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "Factura 2024-0003" })).toBeInTheDocument();
    expect(screen.getByText("Clase de inglés")).toBeInTheDocument();
    expect(screen.getByText("NIF: 87654321B")).toBeInTheDocument();
    expect(mocked.invoiceDetail).toHaveBeenCalledWith(3);
  });

  it("vuelve a guardar el PDF y avisa", async () => {
    const user = userEvent.setup();
    const notify = vi.fn();
    render(<InvoiceDetailModal id={3} notify={notify} onClose={vi.fn()} />);

    await screen.findByText("Clase de inglés");
    await user.click(screen.getByRole("button", { name: /Guardar PDF/ }));

    expect(mocked.exportSavedInvoice).toHaveBeenCalledWith(3);
    expect(notify).toHaveBeenCalledWith("success", expect.stringContaining("/tmp/f.pdf"));
  });
});

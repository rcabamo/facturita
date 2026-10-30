import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api", async () => ({ api: (await import("../test/mocks")).createApiMock() }));

import { api, type InvoicePreview, type InvoiceSettings } from "../lib/api";
import { InvoiceDialog } from "./InvoiceDialog";

const mocked = vi.mocked(api);

const issuer: InvoiceSettings = {
  name: "Ada Lovelace",
  tax_id: "12345678A",
  address: "",
  email: "",
  phone: "",
  bank_account: "ES91 2100 0418 4502 0005 1332",
};

const preview: InvoicePreview = {
  number: "2024-0001",
  period: "2024-03",
  currency: "€",
  client: {
    name: "Ana",
    email: "ana@x",
    tax_id: "87654321B",
    address: "Calle Mayor 1, 28001 Madrid",
  },
  lines: [
    {
      date: "2024-03-05T10:00:00Z",
      concept: "Clase de inglés",
      duration_min: 60,
      rate: 30,
      amount: 30,
    },
  ],
  total: 30,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.previewInvoice.mockResolvedValue(preview);
  mocked.issueInvoice.mockResolvedValue({ id: 1, number: "2024-0001", file: "/tmp/f.pdf" });
});

describe("InvoiceDialog", () => {
  it("muestra la previsualización con clases y total", async () => {
    render(
      <InvoiceDialog
        email="ana@x"
        issuer={issuer}
        onSaveIssuer={vi.fn()}
        onIssued={vi.fn()}
        onClose={vi.fn()}
        notify={vi.fn()}
      />,
    );

    expect(await screen.findByText("Clase de inglés")).toBeInTheDocument();
    expect(screen.getByText("NIF: 87654321B")).toBeInTheDocument();
    expect(screen.getByText("Calle Mayor 1, 28001 Madrid")).toBeInTheDocument();
    expect(screen.getByText(/nº previsto 2024-0001/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Emitir factura" })).toBeEnabled();
  });

  it("permite facturar el mes en curso antes de que acabe", async () => {
    const user = userEvent.setup();
    render(
      <InvoiceDialog
        email="ana@x"
        issuer={issuer}
        onSaveIssuer={vi.fn()}
        onIssued={vi.fn()}
        onClose={vi.fn()}
        notify={vi.fn()}
      />,
    );

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonth = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
    const select = await screen.findByRole("combobox");
    expect(select).toHaveValue(previousMonth);

    await user.selectOptions(select, currentMonth);
    await waitFor(() => expect(mocked.previewInvoice).toHaveBeenCalledWith("ana@x", currentMonth));
  });

  it("emite la factura, notifica y cierra", async () => {
    const user = userEvent.setup();
    const onIssued = vi.fn();
    const onClose = vi.fn();
    const notify = vi.fn();
    render(
      <InvoiceDialog
        email="ana@x"
        issuer={issuer}
        onSaveIssuer={vi.fn()}
        onIssued={onIssued}
        onClose={onClose}
        notify={notify}
      />,
    );

    await screen.findByText("Clase de inglés");
    await user.click(screen.getByRole("button", { name: "Emitir factura" }));

    await waitFor(() =>
      expect(mocked.issueInvoice).toHaveBeenCalledWith("ana@x", expect.any(String)),
    );
    expect(onIssued).toHaveBeenCalledWith("2024-0001");
    expect(onClose).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("success", expect.stringContaining("2024-0001"));
  });

  it("pide los datos del emisor si no están configurados", async () => {
    render(
      <InvoiceDialog
        email="ana@x"
        issuer={{ ...issuer, name: "", tax_id: "" }}
        onSaveIssuer={vi.fn()}
        onIssued={vi.fn()}
        onClose={vi.fn()}
        notify={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Guardar y continuar" })).toBeInTheDocument();
    expect(mocked.previewInvoice).not.toHaveBeenCalled();
  });
});

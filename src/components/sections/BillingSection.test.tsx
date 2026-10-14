import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { InvoiceRecord, InvoiceSettings } from "../../lib/api";
import { BillingSection } from "./BillingSection";

const settings: InvoiceSettings = {
  name: "Ada",
  tax_id: "12345678A",
  address: "",
  email: "",
  phone: "",
};

const invoices: InvoiceRecord[] = [
  {
    id: 1,
    number: "2024-0001",
    issued_on: "2024-04-01T00:00:00Z",
    period: "2024-03",
    client_name: "Ana",
    client_email: "ana@x",
    total: 120,
    currency: "€",
  },
];

function renderSection(overrides: Partial<Parameters<typeof BillingSection>[0]> = {}) {
  const props = {
    settings,
    saving: false,
    onSaveSettings: vi.fn(),
    invoices,
    loading: false,
    onExportInvoice: vi.fn(),
    exportingId: null,
    ...overrides,
  };
  render(<BillingSection {...props} />);
  return props;
}

describe("BillingSection", () => {
  it("lista las facturas emitidas y exporta su PDF", async () => {
    const user = userEvent.setup();
    const props = renderSection();

    expect(screen.getByRole("heading", { name: "Facturas emitidas (1)" })).toBeInTheDocument();
    expect(screen.getByText("2024-0001")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /PDF/ }));
    expect(props.onExportInvoice).toHaveBeenCalledWith(1);
  });

  it("muestra un mensaje cuando no hay facturas", () => {
    renderSection({ invoices: [] });
    expect(screen.getByText(/Todavía no has emitido ninguna factura/)).toBeInTheDocument();
  });

  it("permite guardar los datos del emisor", async () => {
    const user = userEvent.setup();
    const props = renderSection();

    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(props.onSaveSettings).toHaveBeenCalledWith(settings);
  });
});

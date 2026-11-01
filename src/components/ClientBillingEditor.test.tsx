import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api", async () => ({ api: (await import("../test/mocks")).createApiMock() }));

import { api } from "../lib/api";
import { ClientBillingEditor } from "./ClientBillingEditor";

const mocked = vi.mocked(api);

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getClientBilling.mockResolvedValue({
    legal_name: "Empresa SL",
    tax_id: "B12345678",
    address: "Calle Mayor 1",
    language: "es",
  });
  mocked.setClientBilling.mockResolvedValue(undefined);
});

describe("ClientBillingEditor", () => {
  it("carga y guarda los datos fiscales del cliente", async () => {
    const user = userEvent.setup();
    const notify = vi.fn();
    render(<ClientBillingEditor email="ana@x" notify={notify} />);

    const taxInput = await screen.findByLabelText("NIF");
    expect(taxInput).toHaveValue("B12345678");

    await user.clear(taxInput);
    await user.type(taxInput, "B87654321");
    await user.click(screen.getByRole("button", { name: "Guardar datos fiscales" }));

    await waitFor(() =>
      expect(mocked.setClientBilling).toHaveBeenCalledWith("ana@x", {
        legal_name: "Empresa SL",
        tax_id: "B87654321",
        address: "Calle Mayor 1",
        language: "es",
      }),
    );
    expect(notify).toHaveBeenCalledWith("success", "Datos fiscales del cliente guardados.");
  });

  it("guarda el idioma de la factura del cliente", async () => {
    const user = userEvent.setup();
    render(<ClientBillingEditor email="ana@x" />);

    const select = await screen.findByLabelText("Idioma de la factura");
    expect(select).toHaveValue("es");
    await user.selectOptions(select, "en");
    await user.click(screen.getByRole("button", { name: "Guardar datos fiscales" }));

    await waitFor(() =>
      expect(mocked.setClientBilling).toHaveBeenCalledWith(
        "ana@x",
        expect.objectContaining({ language: "en" }),
      ),
    );
  });
});

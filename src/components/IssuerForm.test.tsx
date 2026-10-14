import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { InvoiceSettings } from "../lib/api";
import { IssuerForm } from "./IssuerForm";

const empty: InvoiceSettings = { name: "", tax_id: "", address: "", email: "", phone: "" };

describe("IssuerForm", () => {
  it("envía los valores escritos al hacer submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<IssuerForm value={empty} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Nombre o razón social"), "Ada Lovelace");
    await user.type(screen.getByLabelText("NIF"), "12345678A");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Ada Lovelace",
      tax_id: "12345678A",
      address: "",
      email: "",
      phone: "",
    });
  });

  it("usa la etiqueta de envío y el estado de guardado", () => {
    render(<IssuerForm value={empty} onSubmit={vi.fn()} submitLabel="Guardar y continuar" />);
    expect(screen.getByRole("button", { name: "Guardar y continuar" })).toBeInTheDocument();
  });

  it("deshabilita el botón mientras se guarda", () => {
    render(<IssuerForm value={empty} saving onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
  });
});

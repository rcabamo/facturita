import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewClientDialog } from "./NewClientDialog";

describe("NewClientDialog", () => {
  it("crea un cliente con nombre y email", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => undefined);
    const onClose = vi.fn();
    render(<NewClientDialog onCreate={onCreate} onClose={onClose} />);

    await user.type(screen.getByLabelText("Nombre del cliente"), "Acme S.L.");
    await user.type(screen.getByLabelText("Email del cliente"), "Facturas@Acme.com");
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));

    expect(onCreate).toHaveBeenCalledWith("Acme S.L.", "facturas@acme.com");
    expect(onClose).toHaveBeenCalled();
  });

  it("permite crear el cliente sin email", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => undefined);
    render(<NewClientDialog onCreate={onCreate} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Nombre del cliente"), "Particulares");
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));

    expect(onCreate).toHaveBeenCalledWith("Particulares", null);
  });

  it("muestra el error del backend y no cierra", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => {
      throw new Error("Ya existe un cliente con ese email.");
    });
    const onClose = vi.fn();
    render(<NewClientDialog onCreate={onCreate} onClose={onClose} />);

    await user.type(screen.getByLabelText("Nombre del cliente"), "Acme");
    await user.type(screen.getByLabelText("Email del cliente"), "ana@x");
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));

    expect(await screen.findByText(/Ya existe un cliente con ese email/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("no envía el formulario sin nombre", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => undefined);
    render(<NewClientDialog onCreate={onCreate} onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Crear cliente" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));
    expect(onCreate).not.toHaveBeenCalled();
  });
});

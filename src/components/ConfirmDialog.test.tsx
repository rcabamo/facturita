import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useConfirm } from "./ConfirmDialog";

function Harness({ onResult }: { onResult: (value: boolean) => void }) {
  const { confirm, dialog } = useConfirm();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void confirm({ title: "¿Seguro?", message: "detalle", danger: true }).then(onResult);
        }}
      >
        Abrir
      </button>
      {dialog}
    </>
  );
}

describe("useConfirm", () => {
  it("resuelve true al confirmar y false al cancelar", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aceptar" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(false));
  });

  it("cierra con la tecla Escape y enfoca el botón de confirmar", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    expect(screen.getByRole("button", { name: "Aceptar" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

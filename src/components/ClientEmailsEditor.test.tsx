import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClientEmailsEditor } from "./ClientEmailsEditor";

describe("ClientEmailsEditor", () => {
  it("muestra los emails vinculados y permite separarlos", async () => {
    const user = userEvent.setup();
    const onUnlink = vi.fn();
    render(
      <ClientEmailsEditor
        clientEmail="ana@x"
        aliases={[{ email: "empresa@x", client_email: "ana@x" }]}
        onLink={vi.fn()}
        onUnlink={onUnlink}
      />,
    );

    expect(screen.getByText("empresa@x")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Separar" }));
    expect(onUnlink).toHaveBeenCalledWith("empresa@x");
  });

  it("vincula un email nuevo al cliente", async () => {
    const user = userEvent.setup();
    const onLink = vi.fn();
    render(
      <ClientEmailsEditor clientEmail="ana@x" aliases={[]} onLink={onLink} onUnlink={vi.fn()} />,
    );

    await user.type(screen.getByLabelText("Vincular otro email a ana@x"), "Otro@X.com");
    await user.click(screen.getByRole("button", { name: "Vincular email" }));
    expect(onLink).toHaveBeenCalledWith("otro@x.com", "ana@x");
  });

  it("rechaza un email que ya está vinculado", async () => {
    const user = userEvent.setup();
    const onLink = vi.fn();
    render(
      <ClientEmailsEditor
        clientEmail="ana@x"
        aliases={[{ email: "otro@x", client_email: "ana@x" }]}
        onLink={onLink}
        onUnlink={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Vincular otro email a ana@x"), "otro@x");
    await user.click(screen.getByRole("button", { name: "Vincular email" }));
    expect(onLink).not.toHaveBeenCalled();
    expect(screen.getByText("Ese email ya está vinculado a este cliente.")).toBeInTheDocument();
  });
});

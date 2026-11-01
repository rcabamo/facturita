import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EmailSuggestion } from "../lib/api";
import { ClientEmailsEditor } from "./ClientEmailsEditor";

const suggestions: EmailSuggestion[] = [
  {
    email: "otro@x",
    name: "Otro Alumno",
    client_email: "otro@x",
    client_name: "Otro Alumno",
  },
  {
    email: "paco@empresa.com",
    name: "Paco",
    client_email: "facturas@empresa.com",
    client_name: "Empresa S.L.",
  },
];

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

  it("sugiere emails del calendario y los vincula al pulsarlos", async () => {
    const user = userEvent.setup();
    const onLink = vi.fn();
    render(
      <ClientEmailsEditor
        clientEmail="ana@x"
        aliases={[]}
        suggestions={suggestions}
        onLink={onLink}
        onUnlink={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Vincular otro email a ana@x"), "paco");
    // La sugerencia muestra a qué cliente pertenece ahora el email.
    expect(screen.getByText("Paco · Empresa S.L.")).toBeInTheDocument();
    await user.click(screen.getByTitle("Vincular paco@empresa.com"));
    expect(onLink).toHaveBeenCalledWith("paco@empresa.com", "ana@x");
  });

  it("no sugiere los emails que ya están vinculados al cliente", async () => {
    const user = userEvent.setup();
    render(
      <ClientEmailsEditor
        clientEmail="ana@x"
        aliases={[{ email: "otro@x", client_email: "ana@x" }]}
        suggestions={suggestions}
        onLink={vi.fn()}
        onUnlink={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText("Vincular otro email a ana@x"));
    expect(screen.queryByTitle("Vincular otro@x")).not.toBeInTheDocument();
    expect(screen.getByTitle("Vincular paco@empresa.com")).toBeInTheDocument();
  });

  it("con una única coincidencia, Enter vincula esa sugerencia", async () => {
    const user = userEvent.setup();
    const onLink = vi.fn();
    render(
      <ClientEmailsEditor
        clientEmail="ana@x"
        aliases={[]}
        suggestions={suggestions}
        onLink={onLink}
        onUnlink={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Vincular otro email a ana@x"), "paco");
    await user.keyboard("{Enter}");
    expect(onLink).toHaveBeenCalledWith("paco@empresa.com", "ana@x");
  });
});

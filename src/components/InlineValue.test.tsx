import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClientNameInput, InlineNumberValue, InlineTextValue } from "./InlineValue";

describe("ClientNameInput", () => {
  it("muestra el valor y permite editarlo al hacer clic", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<ClientNameInput value="Ana" placeholder="ana@x" onCommit={onCommit} />);

    await user.click(screen.getByRole("button", { name: "Ana" }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Beatriz");
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith("Beatriz");
  });

  it("muestra el placeholder cuando no hay valor", () => {
    render(<ClientNameInput value="" placeholder="ana@x" onCommit={vi.fn()} />);
    expect(screen.getByText("ana@x")).toBeInTheDocument();
  });

  it("cancela la edición con Escape sin llamar a onCommit", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<ClientNameInput value="Ana" placeholder="ana@x" onCommit={onCommit} />);

    await user.click(screen.getByRole("button", { name: "Ana" }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Otra");
    await user.keyboard("{Escape}");
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Ana" })).toBeInTheDocument();
  });
});

describe("InlineNumberValue", () => {
  it("renderiza el número con el símbolo y permite editarlo", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<InlineNumberValue value={30} symbol="€" onCommit={onCommit} />);

    expect(screen.getByRole("button", { name: /30/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /30/ }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "45,5");
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith(45.5);
  });

  it("no confirma valores vacíos o negativos", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<InlineNumberValue value={30} symbol="€" onCommit={onCommit} />);

    await user.click(screen.getByRole("button", { name: /30/ }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "-5");
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /30/ })).toBeInTheDocument();
  });
});

describe("InlineTextValue", () => {
  it("confirma el texto recortado cuando cambia", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<InlineTextValue value="€" placeholder="€" onCommit={onCommit} />);

    await user.click(screen.getByRole("button", { name: "€" }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "  $  ");
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith("$");
  });

  it("no confirma si el valor no cambia", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<InlineTextValue value="€" placeholder="€" onCommit={onCommit} />);

    await user.click(screen.getByRole("button", { name: "€" }));
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClientRow } from "./ClientRow";

function renderRow(overrides: Partial<Parameters<typeof ClientRow>[0]> = {}) {
  const onToggle = vi.fn();
  render(
    <table>
      <tbody>
        <ClientRow
          name="Ana"
          email="ana@example.com"
          classes={3}
          amount="90 €"
          open={false}
          onToggle={onToggle}
          {...overrides}
        />
      </tbody>
    </table>,
  );
  return { onToggle };
}

describe("ClientRow", () => {
  it("expone `aria-expanded` y alterna al hacer clic", async () => {
    const user = userEvent.setup();
    const { onToggle } = renderRow();
    const row = screen.getByRole("row");
    expect(row).toHaveAttribute("aria-expanded", "false");
    await user.click(row);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("alterna con Enter y con espacio desde el teclado", async () => {
    const user = userEvent.setup();
    const { onToggle } = renderRow();
    const row = screen.getByRole("row");
    row.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("no alterna al pulsar sobre el nombre cuando stopNamePropagation", async () => {
    const user = userEvent.setup();
    const { onToggle } = renderRow({ stopNamePropagation: true });
    await user.click(screen.getByText("Ana"));
    expect(onToggle).not.toHaveBeenCalled();
  });
});

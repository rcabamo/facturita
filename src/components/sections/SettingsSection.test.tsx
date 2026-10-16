import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RatesConfig } from "../../lib/api";
import { SettingsSection } from "./SettingsSection";

const rates: RatesConfig = { default_rate: 30, shared_rate: 20, currency: "€" };

function renderSection(overrides: Partial<Parameters<typeof SettingsSection>[0]> = {}) {
  const props = {
    rates,
    pending: false,
    autoSync: true,
    onChangeAutoSync: vi.fn(),
    onPersistRates: vi.fn(),
    onExportBackup: vi.fn(),
    onImportBackup: vi.fn(),
    ...overrides,
  };
  render(<SettingsSection {...props} />);
  return props;
}

describe("SettingsSection", () => {
  it("muestra las tarifas y guarda los cambios de la tarifa normal", async () => {
    const user = userEvent.setup();
    const props = renderSection();

    await user.click(screen.getByRole("button", { name: /30/ }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "35");
    await user.tab();

    expect(props.onPersistRates).toHaveBeenCalledWith({ default_rate: 35 });
  });

  it("cambia la sincronización automática", async () => {
    const user = userEvent.setup();
    const props = renderSection();
    await user.click(screen.getByRole("checkbox", { name: /Sincronizar automáticamente/ }));
    expect(props.onChangeAutoSync).toHaveBeenCalledWith(false);
  });

  it("dispara la exportación y la importación de copia de seguridad", async () => {
    const user = userEvent.setup();
    const props = renderSection();

    await user.click(screen.getByRole("button", { name: /Exportar todo/ }));
    await user.click(screen.getByRole("button", { name: /Importar…/ }));

    expect(props.onExportBackup).toHaveBeenCalled();
    expect(props.onImportBackup).toHaveBeenCalled();
  });
});

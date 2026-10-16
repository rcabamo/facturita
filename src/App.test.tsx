import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/api", async () => ({ api: (await import("./test/mocks")).createApiMock() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn().mockResolvedValue("0.3.1") }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn().mockResolvedValue(null) }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

import App from "./App";
import { api } from "./lib/api";

const mocked = vi.mocked(api);

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getStatus.mockResolvedValue({
    has_credentials: true,
    connected: true,
    email: "profe@example.com",
    last_sync: null,
  });
  mocked.getSettingValue.mockImplementation(async (key) =>
    key === "onboarding_done" ? "1" : null,
  );
  mocked.setSettingValue.mockResolvedValue(undefined);
  mocked.listCalendars.mockResolvedValue([]);
  mocked.getGoogleCredentials.mockResolvedValue({ client_id: null, has_secret: false });
  mocked.getRatesConfig.mockResolvedValue({ default_rate: 30, shared_rate: 20, currency: "€" });
  mocked.incomeByMonth.mockResolvedValue([]);
  mocked.incomeByClient.mockResolvedValue([]);
  mocked.listClasses.mockResolvedValue([]);
  mocked.pendingCount.mockResolvedValue(0);
  mocked.syncEvents.mockResolvedValue({
    fetched: 0,
    classes: 0,
    calendars: 0,
    stale: 0,
    restored: 0,
    last_sync: "2024-01-01T00:00:00Z",
  });
  mocked.getInvoiceSettings.mockResolvedValue({
    name: "Ada",
    tax_id: "12345678A",
    address: "",
    email: "",
    phone: "",
  });
  mocked.listInvoices.mockResolvedValue([]);
  mocked.latestEventMonth.mockResolvedValue(null);
});

describe("App", () => {
  it("muestra la pantalla de configuración sin credenciales", async () => {
    mocked.getStatus.mockResolvedValue({
      has_credentials: false,
      connected: false,
      email: null,
      last_sync: null,
    });
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Configuración inicial" }),
    ).toBeInTheDocument();
  });

  it("muestra la pantalla de conexión si no está conectado", async () => {
    mocked.getStatus.mockResolvedValue({
      has_credentials: true,
      connected: false,
      email: null,
      last_sync: null,
    });
    render(<App />);
    expect(await screen.findByRole("button", { name: "Conectar con Google" })).toBeInTheDocument();
  });

  it("carga el panel principal con las pestañas y los datos", async () => {
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Histórico/ })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /Clientes/ })).toBeInTheDocument();
    expect(mocked.incomeByMonth).toHaveBeenCalled();
  });
});

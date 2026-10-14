import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { api } from "./api";

const listeners: Array<() => void> = [];

function trackReauth() {
  const handler = vi.fn();
  window.addEventListener("facturita:reauth", handler);
  listeners.push(() => window.removeEventListener("facturita:reauth", handler));
  return handler;
}

afterEach(() => {
  for (const off of listeners.splice(0)) off();
});

beforeEach(() => {
  invoke.mockReset();
});

describe("api.call", () => {
  it("reenvía el comando y los argumentos a invoke y devuelve el resultado", async () => {
    invoke.mockResolvedValue({ connected: true });
    const result = await api.getStatus();
    expect(invoke).toHaveBeenCalledWith("get_status", undefined);
    expect(result).toEqual({ connected: true });
  });

  it("pasa los argumentos camelCase de los comandos", async () => {
    invoke.mockResolvedValue([]);
    await api.setSelectedCalendars(["a", "b"]);
    expect(invoke).toHaveBeenCalledWith("set_selected_calendars", { ids: ["a", "b"] });
  });

  it("emite facturita:reauth cuando el error contiene REAUTH_REQUIRED", async () => {
    invoke.mockRejectedValue("REAUTH_REQUIRED: token caducado");
    const handler = trackReauth();
    await expect(api.getStatus()).rejects.toBe("REAUTH_REQUIRED: token caducado");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("no emite facturita:reauth en errores normales", async () => {
    invoke.mockRejectedValue(new Error("boom"));
    const handler = trackReauth();
    await expect(api.listCalendars()).rejects.toThrow("boom");
    expect(handler).not.toHaveBeenCalled();
  });
});

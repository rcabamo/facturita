import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", async () => ({ api: (await import("../test/mocks")).createApiMock() }));

import { api } from "./api";
import { useTheme } from "./useTheme";

const mocked = vi.mocked(api);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  mocked.getSettingValue.mockResolvedValue(null);
  mocked.setSettingValue.mockResolvedValue(undefined);
});

describe("useTheme", () => {
  it("aplica el tema guardado, lo espeja en el DOM y en localStorage", async () => {
    mocked.getSettingValue.mockResolvedValue("dark");
    const { result } = renderHook(() => useTheme());

    await waitFor(() => expect(result.current.theme).toBe("dark"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("facturita-theme")).toBe("dark");
  });

  it("quita el atributo y el espejo cuando el tema es system", async () => {
    mocked.getSettingValue.mockResolvedValue("system");
    const { result } = renderHook(() => useTheme());

    await waitFor(() => expect(result.current.theme).toBe("system"));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(localStorage.getItem("facturita-theme")).toBeNull();
  });

  it("changeTheme actualiza el estado y persiste el ajuste", async () => {
    mocked.getSettingValue.mockResolvedValue("system");
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe("system"));

    act(() => {
      result.current.changeTheme("light");
    });

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(mocked.setSettingValue).toHaveBeenCalledWith("theme", "light");
  });

  it("ignora valores de tema desconocidos", async () => {
    mocked.getSettingValue.mockResolvedValue("neon");
    const { result } = renderHook(() => useTheme());

    await waitFor(() => expect(mocked.getSettingValue).toHaveBeenCalledWith("theme"));
    expect(result.current.theme).toBe("system");
  });
});

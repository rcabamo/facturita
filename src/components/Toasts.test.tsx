import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toasts, useToasts } from "./Toasts";

describe("useToasts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("añade toasts y permite descartarlos manualmente", () => {
    const { result } = renderHook(() => useToasts());
    act(() => {
      result.current.push("success", "hola");
      result.current.push("error", "fallo");
    });
    expect(result.current.toasts).toHaveLength(2);
    expect(result.current.toasts[0].message).toBe("hola");

    const firstId = result.current.toasts[0].id;
    act(() => {
      result.current.dismiss(firstId);
    });
    expect(result.current.toasts.map((t) => t.message)).toEqual(["fallo"]);
  });

  it("auto-descarta a los 4,5 s los informativos y a los 8 s los de error", () => {
    const { result } = renderHook(() => useToasts());
    act(() => {
      result.current.push("success", "info");
    });
    act(() => {
      vi.advanceTimersByTime(4500);
    });
    expect(result.current.toasts).toHaveLength(0);

    act(() => {
      result.current.push("error", "fallo");
    });
    act(() => {
      vi.advanceTimersByTime(4500);
    });
    expect(result.current.toasts).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(result.current.toasts).toHaveLength(0);
  });
});

describe("Toasts", () => {
  it("renderiza los mensajes y notifica el cierre", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <Toasts
        toasts={[
          { id: 1, kind: "error", message: "fallo" },
          { id: 2, kind: "success", message: "ok" },
        ]}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("fallo");
    expect(screen.getByRole("status")).toHaveTextContent("ok");

    await user.click(screen.getAllByRole("button", { name: "Cerrar aviso" })[0]);
    expect(onDismiss).toHaveBeenCalledWith(1);
  });
});

import { useCallback, useEffect, useState } from "react";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const close = useCallback((value: boolean) => {
    setState((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") close(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [state, close]);

  const dialog = state ? (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close(false);
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <h2 id="confirm-title">{state.title}</h2>
        {state.message && <p className="muted">{state.message}</p>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={() => close(false)}>
            {state.cancelLabel ?? "Cancelar"}
          </button>
          <button
            type="button"
            className={state.danger ? "danger" : undefined}
            autoFocus
            onClick={() => close(true)}
          >
            {state.confirmLabel ?? "Aceptar"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}

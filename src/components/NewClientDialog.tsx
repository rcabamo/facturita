import { useEffect, useRef, useState } from "react";

/** Alta manual de un cliente (p. ej. una empresa que no está en el calendario). */
export function NewClientDialog({
  onCreate,
  onClose,
}: {
  onCreate: (name: string, email: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Escribe el nombre del cliente.");
      return;
    }
    const address = email.trim().toLowerCase();
    if (address && (!address.includes("@") || /\s/.test(address))) {
      setError("El email no es válido.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate(trimmed, address || null);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: el overlay cierra el modal al hacer clic fuera
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-client-title"
        onSubmit={submit}
      >
        <h2 id="new-client-title">Nuevo cliente</h2>
        <p className="muted small">
          Créalo a mano para agrupar bajo él los emails de varios alumnos (por ejemplo, una empresa
          que paga las clases de sus empleados). Después podrás vincularles emails desde su ficha.
        </p>

        <label className="field">
          Nombre
          <input
            ref={nameRef}
            value={name}
            placeholder="Nombre o razón social"
            aria-label="Nombre del cliente"
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
        </label>

        <label className="field">
          Email (opcional)
          <input
            type="email"
            value={email}
            placeholder="facturas@empresa.com"
            aria-label="Email del cliente"
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
          />
        </label>
        <p className="muted small">
          Si lo dejas vacío, el cliente se identifica solo por su nombre. Si pones un email, no
          puede estar ya en uso por otro cliente.
        </p>

        {error && <div className="alert error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" disabled={busy || !name.trim()}>
            {busy ? "Creando…" : "Crear cliente"}
          </button>
        </div>
      </form>
    </div>
  );
}

import { useState } from "react";
import { api } from "../lib/api";
import { Brand } from "./Brand";

export function ConnectScreen({
  onDone,
  reauth = false,
}: {
  onDone: () => void;
  reauth?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await api.connectGoogle();
      onDone();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <div className="card form">
        <Brand compact />
        <h1>{reauth ? "Vuelve a conectar con Google" : "Conecta tu Google Calendar"}</h1>
        <p className="muted">
          {reauth ? (
            <>
              Tu sesión de Google ha caducado o se ha revocado. Vuelve a autorizar el acceso de{" "}
              <strong>solo lectura</strong> para seguir usando Facturita.
            </>
          ) : (
            <>
              Se abrirá tu navegador para autorizar el acceso de <strong>solo lectura</strong> a tus
              calendarios. Al terminar, vuelve a esta ventana.
            </>
          )}
        </p>
        {error && <div className="alert error">{error}</div>}
        <button type="button" onClick={connect} disabled={busy}>
          {busy
            ? "Esperando autorización…"
            : reauth
              ? "Reconectar con Google"
              : "Conectar con Google"}
        </button>
      </div>
    </div>
  );
}

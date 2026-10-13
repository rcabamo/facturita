import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Brand } from "./Brand";

export function SetupScreen({ onDone }: { onDone: () => void }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getGoogleCredentials()
      .then((creds) => setClientId(creds.client_id ?? ""))
      .catch(() => undefined);
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.setGoogleCredentials(clientId, clientSecret);
      onDone();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <form className="card form" onSubmit={save}>
        <Brand compact />
        <h1>Configuración inicial</h1>
        <p className="muted">
          Pega las credenciales OAuth de tipo <strong>Aplicación de escritorio</strong> creadas en
          Google Cloud Console (con la API de Google Calendar habilitada).
        </p>
        <label>
          Client ID
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="xxxxx.apps.googleusercontent.com"
            required
          />
        </label>
        <label>
          Client secret
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="GOCSPX-..."
            required
          />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? "Guardando…" : "Guardar credenciales"}
        </button>
      </form>
    </div>
  );
}

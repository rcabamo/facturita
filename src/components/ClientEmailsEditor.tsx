import { useState } from "react";
import type { ClientAlias } from "../lib/api";

export function ClientEmailsEditor({
  clientEmail,
  aliases,
  busy,
  onLink,
  onUnlink,
}: {
  clientEmail: string;
  aliases: ClientAlias[];
  busy?: boolean;
  onLink: (email: string, clientEmail: string) => void;
  onUnlink: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const linked = aliases
    .filter((alias) => alias.client_email.toLowerCase() === clientEmail.toLowerCase())
    .map((alias) => alias.email);

  function link() {
    const value = email.trim().toLowerCase();
    if (!value.includes("@")) {
      setError("Escribe un email válido.");
      return;
    }
    if (value === clientEmail.toLowerCase() || linked.includes(value)) {
      setError("Ese email ya está vinculado a este cliente.");
      return;
    }
    setError(null);
    setEmail("");
    onLink(value, clientEmail);
  }

  return (
    <div className="client-emails">
      <div className="rate-history-head">
        <span className="muted small">
          Las clases de estos emails se suman a este cliente (también al importar).
        </span>
      </div>
      {linked.length > 0 && (
        <ul className="client-email-list">
          {linked.map((alias) => (
            <li key={alias}>
              <span>{alias}</span>
              <button
                type="button"
                className="link danger"
                disabled={busy}
                onClick={() => onUnlink(alias)}
              >
                Separar
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="client-email-add">
        <input
          type="email"
          value={email}
          placeholder="otro-email@ejemplo.com"
          aria-label={`Vincular otro email a ${clientEmail}`}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              link();
            }
          }}
        />
        <button type="button" className="ghost" disabled={busy || !email.trim()} onClick={link}>
          Vincular email
        </button>
      </div>
      {error && <p className="muted small error-text">{error}</p>}
    </div>
  );
}

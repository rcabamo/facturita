import { useMemo, useState } from "react";
import type { ClientAlias, EmailSuggestion } from "../lib/api";

export function ClientEmailsEditor({
  clientEmail,
  aliases,
  suggestions = [],
  busy,
  onLink,
  onUnlink,
}: {
  clientEmail: string;
  aliases: ClientAlias[];
  /** Emails del calendario para autocompletar (con su cliente actual). */
  suggestions?: EmailSuggestion[];
  busy?: boolean;
  onLink: (email: string, clientEmail: string) => void;
  onUnlink: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linked = aliases
    .filter((alias) => alias.client_email.toLowerCase() === clientEmail.toLowerCase())
    .map((alias) => alias.email);

  // Sugerencias útiles: ni este mismo cliente ni emails ya vinculados a él.
  const options = useMemo(() => {
    const target = clientEmail.toLowerCase();
    const taken = new Set(
      aliases
        .filter((alias) => alias.client_email.toLowerCase() === target)
        .map((alias) => alias.email.toLowerCase()),
    );
    return suggestions.filter(
      (item) => item.email.toLowerCase() !== target && !taken.has(item.email.toLowerCase()),
    );
  }, [suggestions, clientEmail, aliases]);

  const query = email.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return options.slice(0, 8);
    return options
      .filter(
        (item) =>
          item.email.toLowerCase().includes(query) ||
          (item.name ?? "").toLowerCase().includes(query) ||
          item.client_name.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [options, query]);

  function link(value: string = email) {
    let candidate = value.trim().toLowerCase();
    // Si se ha escrito solo una parte y hay una única coincidencia, se usa esa.
    if (!candidate.includes("@") && matches.length === 1) {
      candidate = matches[0].email.toLowerCase();
    }
    if (!candidate.includes("@")) {
      setError("Escribe un email válido.");
      return;
    }
    if (candidate === clientEmail.toLowerCase() || linked.includes(candidate)) {
      setError("Ese email ya está vinculado a este cliente.");
      return;
    }
    setError(null);
    setEmail("");
    setOpen(false);
    onLink(candidate, clientEmail);
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
        <div className="client-email-input">
          <input
            type="email"
            value={email}
            placeholder="otro-email@ejemplo.com"
            aria-label={`Vincular otro email a ${clientEmail}`}
            autoComplete="off"
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                link();
              }
              if (event.key === "Escape") setOpen(false);
            }}
          />
          {open && matches.length > 0 && (
            <ul className="client-email-suggestions" aria-label="Sugerencias de emails">
              {matches.map((item) => (
                <li key={item.email}>
                  <button
                    type="button"
                    title={`Vincular ${item.email}`}
                    onMouseDown={(event) => {
                      // Sin `preventDefault` el input perdería el foco antes del clic.
                      event.preventDefault();
                      link(item.email);
                    }}
                  >
                    <span className="suggestion-email">{item.email}</span>
                    <span className="muted small">
                      {item.name ? `${item.name} · ` : ""}
                      {item.client_name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          className="ghost"
          disabled={busy || !email.trim()}
          onClick={() => link()}
        >
          Vincular email
        </button>
      </div>
      {error && <p className="muted small error-text">{error}</p>}
    </div>
  );
}

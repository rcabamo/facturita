import { useCallback, useEffect, useRef, useState } from "react";
import { api, type RateHistoryEntry } from "../lib/api";
import { formatNumber } from "../lib/format";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function splitMonth(value: string): { year: number; month: number } {
  const [year, month] = value.split("-").map(Number);
  return { year, month };
}

function RateCell({
  value,
  placeholder,
  onCommit,
}: {
  value: number | null;
  placeholder: number;
  onCommit: (value: number | null) => void;
}) {
  const [text, setText] = useState(value != null ? String(value) : "");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(value != null ? String(value) : "");
  }, [value]);

  function commit() {
    const trimmed = text.trim();
    if (trimmed === "") {
      if (value != null) onCommit(null);
      return;
    }
    const parsed = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setText(value != null ? String(value) : "");
      return;
    }
    if (parsed !== value) onCommit(parsed);
  }

  return (
    <input
      ref={ref}
      className="rate-input"
      inputMode="decimal"
      value={text}
      placeholder={placeholder ? String(placeholder) : "—"}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function RateHistoryEditor({
  email,
  currency,
  defaultRate,
  onChanged,
  notify,
}: {
  email: string;
  currency: string;
  defaultRate: number;
  onChanged: () => void;
  notify?: (kind: "success" | "error" | "info", message: string) => void;
}) {
  const [entries, setEntries] = useState<RateHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await api.clientRateHistory(email));
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      await reload();
      onChanged();
    } catch (err) {
      setError(String(err));
      notify?.("error", String(err));
    } finally {
      setBusy(false);
    }
  }

  function changeMonth(oldMonth: string, newMonth: string) {
    if (oldMonth === newMonth) return;
    const entry = entries.find((item) => item.effective_from === oldMonth);
    void run(async () => {
      await api.updateClientRate(email, oldMonth, newMonth, entry?.rate ?? null);
      notify?.("success", "Mes actualizado.");
    });
  }

  function changeRate(month: string, rate: number | null) {
    void run(async () => {
      await api.setClientRate(email, rate, month);
      notify?.("success", "Tarifa actualizada.");
    });
  }

  function remove(month: string) {
    void run(async () => {
      await api.deleteClientRate(email, month);
      notify?.("success", "Tarifa eliminada.");
    });
  }

  function add() {
    const month = currentYearMonth();
    const exists = entries.some((item) => item.effective_from === month);
    const rate = entries[0]?.rate ?? null;
    void run(async () => {
      await api.setClientRate(email, rate, month);
      notify?.("success", exists ? "Tarifa del mes actualizada." : "Tarifa añadida.");
    });
  }

  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let year = currentYear + 2; year >= currentYear - 6; year -= 1) years.push(year);

  return (
    <div className="rate-history">
      <div className="rate-history-head">
        <span className="muted small">
          La tarifa se aplica a las clases de ese mes en adelante (vacío = tarifa normal).
        </span>
        <button type="button" className="ghost" onClick={add} disabled={busy}>
          {busy ? "Guardando…" : "Añadir tarifa"}
        </button>
      </div>
      {error && <div className="alert error">{error}</div>}
      {loading && entries.length === 0 ? (
        <p className="muted small">Cargando…</p>
      ) : entries.length === 0 ? (
        <p className="muted small">Sin tarifas propias: se usa la tarifa normal.</p>
      ) : (
        <div className="rate-rows">
          {entries.map((entry) => {
            const { year, month } = splitMonth(entry.effective_from);
            return (
              <div className="rate-row" key={entry.effective_from}>
                <div className="month-select">
                  <select
                    aria-label="Mes"
                    value={month}
                    onChange={(event) =>
                      changeMonth(
                        entry.effective_from,
                        `${year}-${String(Number(event.target.value)).padStart(2, "0")}`,
                      )
                    }
                  >
                    {MONTHS.map((label, index) => (
                      <option key={label} value={index + 1}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Año"
                    value={year}
                    onChange={(event) =>
                      changeMonth(
                        entry.effective_from,
                        `${event.target.value}-${entry.effective_from.slice(5)}`,
                      )
                    }
                  >
                    {years.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <RateCell
                  value={entry.rate}
                  placeholder={defaultRate}
                  onCommit={(rate) => changeRate(entry.effective_from, rate)}
                />
                <span className="muted small">{currency}</span>
                <button
                  type="button"
                  className="link danger"
                  onClick={() => remove(entry.effective_from)}
                >
                  Quitar
                </button>
              </div>
            );
          })}
        </div>
      )}
      <p className="muted small">
        Tarifa normal actual: {formatNumber(defaultRate)} {currency}.
      </p>
    </div>
  );
}

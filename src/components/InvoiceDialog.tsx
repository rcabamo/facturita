import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type InvoicePreview, type InvoiceSettings } from "../lib/api";
import { formatDate, formatMonth } from "../lib/dates";
import { formatMoney } from "../lib/format";
import { IssuerForm } from "./IssuerForm";

function monthOptions(count = 24): string[] {
  const options: string[] = [];
  const date = new Date();
  // Se incluye el mes en curso para poder emitir facturas antes de que acabe.
  date.setDate(1);
  for (let i = 0; i < count; i += 1) {
    options.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
    date.setMonth(date.getMonth() - 1);
  }
  return options;
}

function defaultInvoiceMonth(): string {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Clases que entran por defecto: todas las del mes que aún no están facturadas. */
function defaultSelection(preview: InvoicePreview | null): Set<string> {
  const classes = preview?.classes ?? [];
  return new Set(classes.filter((item) => item.invoice_id == null).map((item) => item.event_id));
}

export function InvoiceDialog({
  email,
  issuer,
  onSaveIssuer,
  onIssued,
  onClose,
  notify,
}: {
  email: string;
  issuer: InvoiceSettings;
  onSaveIssuer: (settings: InvoiceSettings) => Promise<void>;
  onIssued: (message: string) => void;
  onClose: () => void;
  notify: (kind: "success" | "error" | "info", message: string) => void;
}) {
  const configured = issuer.name.trim() !== "" && issuer.tax_id.trim() !== "";
  const [view, setView] = useState<"issuer" | "invoice">(configured ? "invoice" : "issuer");
  const [months] = useState(() => monthOptions());
  const [month, setMonth] = useState(() => defaultInvoiceMonth());
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savingIssuer, setSavingIssuer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.previewInvoice(email, month);
      setPreview(result);
      setSelected(defaultSelection(result));
    } catch (err) {
      setError(String(err));
      setPreview(null);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, [email, month]);

  useEffect(() => {
    if (view === "invoice") void loadPreview();
  }, [view, loadPreview]);

  const classes = useMemo(() => preview?.classes ?? [], [preview]);
  const selectable = useMemo(() => classes.filter((item) => item.invoice_id == null), [classes]);
  const chosen = useMemo(
    () => classes.filter((item) => selected.has(item.event_id)),
    [classes, selected],
  );
  const total = chosen.reduce((sum, item) => sum + item.amount, 0);
  const allSelected = selectable.length > 0 && chosen.length === selectable.length;

  function toggleClass(eventId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((item) => item.event_id)));
  }

  async function saveIssuer(settings: InvoiceSettings) {
    setSavingIssuer(true);
    setError(null);
    try {
      await onSaveIssuer(settings);
      setView("invoice");
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingIssuer(false);
    }
  }

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.issueInvoice(
        email,
        month,
        chosen.map((item) => item.event_id),
      );
      if (result) {
        notify("success", `Factura ${result.number} guardada en ${result.file}`);
        onIssued(result.number);
        onClose();
      }
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
      <div
        className="modal invoice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-title"
      >
        <h2 id="invoice-title">Emitir factura</h2>
        <p className="muted small">
          Cliente: <strong>{preview?.client.name ?? email}</strong>
          {preview?.client.name !== email && <> · {email}</>}
        </p>

        {error && <div className="alert error">{error}</div>}

        {view === "issuer" ? (
          <>
            <p className="muted small">
              Antes de emitir, completa tus datos de facturación (nombre y NIF).
            </p>
            <IssuerForm
              value={issuer}
              saving={savingIssuer}
              submitLabel="Guardar y continuar"
              onSubmit={saveIssuer}
            />
          </>
        ) : (
          <>
            <div className="field">
              <label>
                Mes a facturar
                <select value={month} onChange={(event) => setMonth(event.target.value)}>
                  {months.map((value) => (
                    <option key={value} value={value}>
                      {formatMonth(value)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {preview && (
              <div className="invoice-client-data">
                <p className="muted small">Datos fiscales del cliente</p>
                {preview.client.tax_id ? (
                  <p>NIF: {preview.client.tax_id}</p>
                ) : (
                  <p className="muted small">
                    Sin NIF. Puedes añadirlo en la ficha del cliente en Clientes.
                  </p>
                )}
                {preview.client.address && <p>{preview.client.address}</p>}
              </div>
            )}

            {loading ? (
              <p className="muted small">Cargando clases…</p>
            ) : classes.length === 0 ? (
              <p className="muted">No hay clases en {formatMonth(month)}.</p>
            ) : (
              <>
                <p className="muted small invoice-select-hint">
                  Marca las clases que quieres incluir. Las que ya están en una factura aparecen
                  bloqueadas para no facturarlas dos veces.
                </p>
                <div className="table-wrap invoice-preview">
                  <table className="table invoice-select">
                    <caption className="sr-only">Clases a incluir en la factura</caption>
                    <thead>
                      <tr>
                        <th scope="col" className="sel">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleAll}
                            disabled={selectable.length === 0}
                            aria-label="Seleccionar todas las clases"
                            title="Seleccionar todas"
                          />
                        </th>
                        <th scope="col">Fecha</th>
                        <th scope="col">Clase</th>
                        <th scope="col" className="num">
                          Tarifa
                        </th>
                        <th scope="col" className="num">
                          Importe
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {classes.map((item) => {
                        const invoiced = item.invoice_id != null;
                        return (
                          <tr key={item.event_id} className={invoiced ? "invoiced" : undefined}>
                            <td className="sel">
                              <input
                                type="checkbox"
                                checked={selected.has(item.event_id)}
                                disabled={invoiced}
                                onChange={() => toggleClass(item.event_id)}
                                aria-label={`Incluir ${item.concept || "clase"} del ${formatDate(item.date)}`}
                              />
                            </td>
                            <td className="nowrap">{formatDate(item.date)}</td>
                            <td>
                              {item.concept || "Clase"}
                              {invoiced && (
                                <span className="badge invoiced">En {item.invoice_number}</span>
                              )}
                            </td>
                            <td className="num">
                              {formatMoney(item.rate, preview?.currency ?? "")}
                            </td>
                            <td className="num strong">
                              {formatMoney(item.amount, preview?.currency ?? "")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="invoice-total">
                  <span className="muted small">
                    {chosen.length} de {classes.length} clase{classes.length === 1 ? "" : "s"} · nº
                    previsto {preview?.number}
                  </span>
                  <strong>{formatMoney(total, preview?.currency ?? "")}</strong>
                </p>
                {selectable.length === 0 && (
                  <p className="muted small">
                    Todas las clases de {formatMonth(month)} ya están incluidas en una factura.
                  </p>
                )}
              </>
            )}

            <div className="modal-actions">
              <button type="button" className="ghost" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={issue}
                disabled={busy || loading || chosen.length === 0}
              >
                {busy ? "Emitiendo…" : "Emitir factura"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

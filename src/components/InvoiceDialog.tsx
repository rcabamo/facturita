import { useCallback, useEffect, useState } from "react";
import { api, type InvoicePreview, type InvoiceSettings } from "../lib/api";
import { formatMonth } from "../lib/dates";
import { formatMoney } from "../lib/format";
import { ClassDetailTable } from "./ClassDetailTable";
import { IssuerForm } from "./IssuerForm";

function monthOptions(count = 24): string[] {
  const options: string[] = [];
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  for (let i = 0; i < count; i += 1) {
    options.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
    date.setMonth(date.getMonth() - 1);
  }
  return options;
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
  const [month, setMonth] = useState(() => monthOptions()[0]);
  const [taxId, setTaxId] = useState("");
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savingIssuer, setSavingIssuer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPreview(await api.previewInvoice(email, month));
    } catch (err) {
      setError(String(err));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [email, month]);

  useEffect(() => {
    if (view === "invoice") void loadPreview();
  }, [view, loadPreview]);

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
      const result = await api.issueInvoice(email, month, taxId.trim() || null);
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
            <div className="field">
              <label>
                NIF del cliente (opcional)
                <input
                  value={taxId}
                  onChange={(event) => setTaxId(event.target.value)}
                  placeholder="Opcional"
                />
              </label>
            </div>

            {loading ? (
              <p className="muted small">Cargando clases…</p>
            ) : preview && preview.lines.length === 0 ? (
              <p className="muted">No hay clases en {formatMonth(month)}.</p>
            ) : preview ? (
              <div className="table-wrap invoice-preview">
                <ClassDetailTable
                  rows={preview.lines.map((line) => ({
                    id: `${line.date}-${line.concept}-${line.amount}`,
                    summary: line.concept || "Clase",
                    start_ts: line.date,
                    duration_min: line.duration_min,
                    rate: line.rate,
                    amount: line.amount,
                  }))}
                  money={(value) => formatMoney(value, preview.currency)}
                  dateFormat="date"
                />
                <p className="invoice-total">
                  <span className="muted small">
                    {preview.lines.length} clase{preview.lines.length === 1 ? "" : "s"} · nº
                    previsto {preview.number}
                  </span>
                  <strong>{formatMoney(preview.total, preview.currency)}</strong>
                </p>
              </div>
            ) : null}

            <div className="modal-actions">
              <button type="button" className="ghost" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={issue}
                disabled={busy || loading || !preview || preview.lines.length === 0}
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

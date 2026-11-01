import { useEffect, useState } from "react";
import { api, type InvoiceData } from "../lib/api";
import { formatDate, formatMonth } from "../lib/dates";
import { formatMoney } from "../lib/format";
import { ClassDetailTable } from "./ClassDetailTable";
import { DownloadIcon } from "./icons";

/** Ficha de una factura ya emitida, con la opción de volver a guardar el PDF. */
export function InvoiceDetailModal({
  id,
  onClose,
  notify,
}: {
  id: number;
  onClose: () => void;
  notify: (kind: "success" | "error" | "info", message: string) => void;
}) {
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setInvoice(null);
    setError(null);
    api
      .invoiceDetail(id)
      .then((data) => {
        if (alive) setInvoice(data);
      })
      .catch((err) => {
        if (alive) setError(String(err));
      });
    return () => {
      alive = false;
    };
  }, [id]);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const path = await api.exportSavedInvoice(id);
      if (path) notify("success", `Factura guardada en ${path}`);
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
        aria-labelledby="invoice-detail-title"
      >
        <h2 id="invoice-detail-title">Factura {invoice?.number ?? "…"}</h2>

        {error && <div className="alert error">{error}</div>}

        {!invoice ? (
          !error && <p className="muted small">Cargando factura…</p>
        ) : (
          <>
            <p className="muted small">
              {invoice.client.name} · {invoice.client.email}
            </p>
            <div className="invoice-client-data">
              <p>
                <span className="muted small">Emitida el </span>
                {formatDate(invoice.issued_on)}
                <span className="muted small"> · Periodo </span>
                {formatMonth(invoice.period)}
              </p>
              {invoice.client.tax_id && <p>NIF: {invoice.client.tax_id}</p>}
              {invoice.client.address && <p>{invoice.client.address}</p>}
            </div>

            <div className="table-wrap invoice-preview">
              <ClassDetailTable
                rows={invoice.lines.map((line) => ({
                  id: line.event_id ?? `${line.date}-${line.concept}-${line.amount}`,
                  summary: line.concept || "Clase",
                  start_ts: line.date,
                  duration_min: line.duration_min,
                  rate: line.rate,
                  amount: line.amount,
                }))}
                money={(value) => formatMoney(value, invoice.currency)}
                dateFormat="date"
              />
            </div>

            <p className="invoice-total">
              <span className="muted small">
                {invoice.lines.length} clase{invoice.lines.length === 1 ? "" : "s"}
              </span>
              <strong>{formatMoney(invoice.total, invoice.currency)}</strong>
            </p>

            <div className="modal-actions">
              <button type="button" className="ghost" onClick={onClose} disabled={busy}>
                Cerrar
              </button>
              <button type="button" className="with-icon" onClick={download} disabled={busy}>
                <DownloadIcon size={15} />
                {busy ? "Guardando…" : "Guardar PDF"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

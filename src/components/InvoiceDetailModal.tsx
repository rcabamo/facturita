import { useCallback, useEffect, useState } from "react";
import { api, type InvoiceData } from "../lib/api";
import { formatDate, formatMonth } from "../lib/dates";
import { formatMoney } from "../lib/format";
import { ClassDetailTable } from "./ClassDetailTable";
import { useConfirm } from "./ConfirmDialog";
import { DownloadIcon } from "./icons";

/** Ficha de una factura emitida: estado de cobro, PDF y corrección de líneas. */
export function InvoiceDetailModal({
  id,
  onClose,
  onChanged,
  notify,
}: {
  id: number;
  onClose: () => void;
  /** Se llama tras marcar cobrada, anular o quitar una clase. */
  onChanged: () => void;
  notify: (kind: "success" | "error" | "info", message: string) => void;
}) {
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [voided, setVoided] = useState(false);
  const [paidOn, setPaidOn] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { confirm, dialog: confirmDialog, open: confirmOpen } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInvoice(await api.invoiceDetail(id));
    } catch (err) {
      setError(String(err));
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Escape cierra el modal, salvo que haya una confirmación abierta encima.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !confirmOpen) onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, confirmOpen]);

  // El estado de cobro y la anulación viven en el registro, no en el snapshot.
  useEffect(() => {
    let alive = true;
    api
      .listInvoices()
      .then((list) => {
        if (!alive) return;
        const record = list.find((item) => item.id === id);
        setPaidOn(record?.paid_on ?? null);
        setVoided(record?.voided ?? false);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id]);

  async function run(action: () => Promise<void>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      notify("success", message);
      onChanged();
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function togglePaid() {
    const paid = paidOn == null;
    await run(
      () => api.setInvoicePaid(id, paid),
      paid ? "Factura marcada como cobrada." : "Factura marcada como pendiente.",
    );
    setPaidOn(paid ? new Date().toISOString().slice(0, 10) : null);
  }

  async function voidInvoice() {
    const ok = await confirm({
      title: "Anular factura",
      message:
        "La factura se conserva con su número, pero sus clases volverán a estar sin facturar y dejará de contar como pendiente de cobro.",
      confirmLabel: "Anular",
      danger: true,
    });
    if (!ok) return;
    await run(() => api.voidInvoice(id), "Factura anulada.");
    setVoided(true);
    setPaidOn(null);
  }

  async function removeLine(eventId: string) {
    const ok = await confirm({
      title: "Quitar clase de la factura",
      message:
        "Se quitará esa clase de la factura y se recalculará el total. El PDF que ya hayas enviado no cambia.",
      confirmLabel: "Quitar",
      danger: true,
    });
    if (!ok) return;
    await run(() => api.removeInvoiceLine(id, eventId), "Clase quitada de la factura.");
  }

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
      {/* biome-ignore lint/a11y/noStaticElementInteractions: el diálogo gestiona Escape por documento */}
      <div
        className="modal invoice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-detail-title"
      >
        {confirmDialog}
        <h2 id="invoice-detail-title">
          Factura {invoice?.number ?? "…"}
          {voided ? (
            <span className="badge voided">anulada</span>
          ) : paidOn ? (
            <span className="badge accepted">cobrada</span>
          ) : (
            <span className="badge pending">pendiente</span>
          )}
        </h2>

        {error && <div className="alert error">{error}</div>}

        {loading && !invoice ? (
          <p className="muted small">Cargando factura…</p>
        ) : invoice ? (
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
                <span className="muted small"> · Idioma </span>
                {invoice.lang === "en" ? "inglés" : "español"}
              </p>
              {invoice.client.tax_id && <p>NIF: {invoice.client.tax_id}</p>}
              {invoice.client.address && <p>{invoice.client.address}</p>}
              {paidOn && <p className="muted small">Cobrada el {formatDate(paidOn)}</p>}
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
                  eventId: line.event_id ?? null,
                }))}
                money={(value) => formatMoney(value, invoice.currency)}
                dateFormat="date"
                onRemove={
                  voided
                    ? undefined
                    : (row) => {
                        if (row.eventId) void removeLine(row.eventId);
                      }
                }
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
              {!voided && (
                <button type="button" className="ghost" onClick={togglePaid} disabled={busy}>
                  {paidOn ? "Marcar pendiente" : "Marcar cobrada"}
                </button>
              )}
              <button type="button" className="ghost with-icon" onClick={download} disabled={busy}>
                <DownloadIcon size={15} />
                {busy ? "Guardando…" : "Guardar PDF"}
              </button>
              {!voided && (
                <button type="button" className="danger" onClick={voidInvoice} disabled={busy}>
                  Anular
                </button>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

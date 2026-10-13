import type { InvoiceRecord, InvoiceSettings } from "../../lib/api";
import { formatDate } from "../../lib/dates";
import { formatMoney } from "../../lib/format";
import { IssuerForm } from "../IssuerForm";
import { DownloadIcon } from "../icons";
import { SkeletonRows } from "../Skeleton";

export function BillingSection({
  settings,
  saving,
  onSaveSettings,
  invoices,
  loading,
  onExportInvoice,
  exportingId,
}: {
  settings: InvoiceSettings;
  saving: boolean;
  onSaveSettings: (settings: InvoiceSettings) => void;
  invoices: InvoiceRecord[];
  loading: boolean;
  onExportInvoice: (id: number) => void;
  exportingId: number | null;
}) {
  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Datos de facturación</h2>
          {saving && <span className="muted small">Guardando…</span>}
        </div>
        <p className="muted small">
          Estos datos se muestran como emisor en las facturas. El nombre y el NIF son obligatorios
          para poder emitir.
        </p>
        <IssuerForm value={settings} saving={saving} onSubmit={onSaveSettings} />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Facturas emitidas ({invoices.length})</h2>
        </div>
        {loading ? (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                <SkeletonRows rows={4} cols={5} />
              </tbody>
            </table>
          </div>
        ) : invoices.length === 0 ? (
          <p className="muted">
            Todavía no has emitido ninguna factura. Emite una desde Clientes abriendo el cliente y
            pulsando «Emitir factura».
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Facturas emitidas</caption>
              <thead>
                <tr>
                  <th scope="col">Nº</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Periodo</th>
                  <th scope="col" className="num">
                    Total
                  </th>
                  <th scope="col" className="num">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.number}</td>
                    <td className="nowrap">{formatDate(invoice.issued_on)}</td>
                    <td>{invoice.client_name}</td>
                    <td className="nowrap">{invoice.period}</td>
                    <td className="num strong">{formatMoney(invoice.total, invoice.currency)}</td>
                    <td className="num actions">
                      <button
                        type="button"
                        className="link with-icon"
                        disabled={exportingId === invoice.id}
                        onClick={() => onExportInvoice(invoice.id)}
                      >
                        <DownloadIcon size={15} />
                        {exportingId === invoice.id ? "Guardando…" : "PDF"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

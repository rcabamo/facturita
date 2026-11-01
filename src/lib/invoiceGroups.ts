import type { ClassDetail } from "./api";

/** Clases de un cliente agrupadas por factura (y las que aún no se han facturado). */
export interface InvoiceGroup {
  key: string;
  invoiceId: number | null;
  invoiceNumber: string | null;
  rows: ClassDetail[];
  total: number;
}

/**
 * Agrupa las clases de un cliente por la factura que las incluye. Las clases
 * sin factura van primero y, después, las facturas de la más reciente a la más
 * antigua (`invoice_id` crece con la emisión).
 */
export function groupClassesByInvoice(classes: ClassDetail[]): InvoiceGroup[] {
  const groups = new Map<string, InvoiceGroup>();
  for (const row of classes) {
    const invoiced = row.invoice_id != null;
    const key = invoiced ? `invoice:${row.invoice_id}` : "pending";
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        invoiceId: invoiced ? (row.invoice_id as number) : null,
        invoiceNumber: invoiced ? (row.invoice_number ?? null) : null,
        rows: [],
        total: 0,
      };
      groups.set(key, group);
    }
    group.rows.push(row);
    group.total += row.amount;
  }
  return [...groups.values()].sort((a, b) => {
    if (a.invoiceId == null) return -1;
    if (b.invoiceId == null) return 1;
    return b.invoiceId - a.invoiceId;
  });
}

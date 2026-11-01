import { describe, expect, it } from "vitest";
import type { ClassDetail } from "./api";
import { groupClassesByInvoice } from "./invoiceGroups";

function row(id: string, amount: number, invoiceId: number | null): ClassDetail {
  return {
    id,
    summary: id,
    start_ts: "2024-03-05T10:00:00Z",
    start_local: "2024-03-05T11:00:00",
    end_ts: "2024-03-05T11:00:00Z",
    duration_min: 60,
    email: "ana@x",
    name: "Ana",
    rate: amount,
    amount,
    invoice_id: invoiceId,
    invoice_number: invoiceId == null ? null : `2024-000${invoiceId}`,
  };
}

describe("groupClassesByInvoice", () => {
  it("pone primero las clases sin facturar y suma su importe", () => {
    const groups = groupClassesByInvoice([row("a", 30, 1), row("b", 20, null), row("c", 10, 1)]);

    expect(groups.map((group) => group.key)).toEqual(["pending", "invoice:1"]);
    expect(groups[0].rows.map((item) => item.id)).toEqual(["b"]);
    expect(groups[0].total).toBe(20);
    expect(groups[1].total).toBe(40);
    expect(groups[1].invoiceNumber).toBe("2024-0001");
  });

  it("ordena las facturas de la más reciente a la más antigua", () => {
    const groups = groupClassesByInvoice([row("a", 10, 1), row("b", 10, 5), row("c", 10, 3)]);
    expect(groups.map((group) => group.invoiceId)).toEqual([5, 3, 1]);
  });

  it("devuelve una lista vacía sin clases", () => {
    expect(groupClassesByInvoice([])).toEqual([]);
  });
});

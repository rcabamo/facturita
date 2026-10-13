import { formatDate, formatDateTime } from "../lib/dates";

export interface ClassDetailRow {
  id: string;
  summary: string | null;
  start_ts: string;
  duration_min: number | null;
  rate: number;
  amount: number;
}

export function ClassDetailTable({
  rows,
  money,
  dateFormat = "datetime",
  emptyMessage = "Sin clases registradas.",
}: {
  rows: ClassDetailRow[];
  money: (value: number) => string;
  dateFormat?: "date" | "datetime";
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <p className="muted">{emptyMessage}</p>;
  }

  return (
    <table className="table">
      <caption className="sr-only">Clases registradas</caption>
      <thead>
        <tr>
          <th scope="col">Fecha</th>
          <th scope="col">Clase</th>
          <th scope="col" className="num">
            Duración
          </th>
          <th scope="col" className="num">
            Tarifa
          </th>
          <th scope="col" className="num">
            Importe
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>
              {dateFormat === "date" ? formatDate(row.start_ts) : formatDateTime(row.start_ts)}
            </td>
            <td>{row.summary ?? "(sin título)"}</td>
            <td className="num">{row.duration_min != null ? `${row.duration_min} min` : "—"}</td>
            <td className="num">{money(row.rate)}</td>
            <td className="num strong">{money(row.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

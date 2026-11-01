import { formatDate, formatDateTime } from "../lib/dates";
import { InlineNumberValue } from "./InlineValue";

export interface ClassDetailRow {
  id: string;
  summary: string | null;
  start_ts: string;
  duration_min: number | null;
  rate: number;
  amount: number;
  /** Email del invitado (necesario para editar el importe de la clase). */
  email?: string;
  /** `true` si la tarifa de esta clase se ha fijado a mano. */
  overridden?: boolean;
  /**
   * Número de la factura que incluye la clase. Si está puesto, la tarifa es de
   * solo lectura: cambiarla descuadraría la factura emitida.
   */
  invoiceNumber?: string | null;
  /** Evento de origen cuando la fila viene de una factura (para quitarla). */
  eventId?: string | null;
}

export function ClassDetailTable({
  rows,
  money,
  symbol = "",
  dateFormat = "datetime",
  emptyMessage = "Sin clases registradas.",
  onChangeRate,
  onRemove,
}: {
  rows: ClassDetailRow[];
  money: (value: number) => string;
  /** Símbolo de moneda para el editor de tarifa. */
  symbol?: string;
  dateFormat?: "date" | "datetime";
  emptyMessage?: string;
  /** Si se indica, la tarifa/hora de cada clase se puede editar a mano. */
  onChangeRate?: (row: ClassDetailRow, rate: number | null) => void;
  /** Si se indica, cada fila con `eventId` ofrece quitarla de la factura. */
  onRemove?: (row: ClassDetailRow) => void;
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
            Tarifa
          </th>
          <th scope="col" className="num">
            Importe
          </th>
          {onRemove && (
            <th scope="col" className="num">
              Acciones
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.id}-${row.email ?? ""}`}>
            <td>
              {dateFormat === "date" ? formatDate(row.start_ts) : formatDateTime(row.start_ts)}
            </td>
            <td>{row.summary ?? "(sin título)"}</td>
            <td className="num">
              {onChangeRate && !row.invoiceNumber ? (
                <span className="amount-edit">
                  <InlineNumberValue
                    value={row.rate}
                    symbol={symbol ? `${symbol}/h` : "/h"}
                    title="Editar la tarifa/hora de esta clase"
                    onCommit={(value) => onChangeRate(row, value)}
                  />
                  {row.overridden && (
                    <button
                      type="button"
                      className="link subtle"
                      title="Volver a la tarifa automática"
                      aria-label="Volver a la tarifa automática"
                      onClick={() => onChangeRate(row, null)}
                    >
                      ↺
                    </button>
                  )}
                </span>
              ) : row.invoiceNumber ? (
                <span
                  className="rate-locked"
                  title={`Está en la factura ${row.invoiceNumber}: anúlala o quita la clase para cambiar la tarifa`}
                >
                  {money(row.rate)} 🔒
                </span>
              ) : (
                money(row.rate)
              )}
            </td>
            <td className="num strong">{money(row.amount)}</td>
            {onRemove && (
              <td className="num actions">
                {row.eventId && (
                  <button
                    type="button"
                    className="link danger"
                    title="Quitar esta clase de la factura"
                    onClick={() => onRemove(row)}
                  >
                    Quitar
                  </button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

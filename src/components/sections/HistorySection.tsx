import type { ClassDetail, ClientIncome, MonthlyIncome } from "../../lib/api";
import { formatDateTime } from "../../lib/dates";
import type { SortKey, SortState } from "../../lib/sorting";
import { MonthlyChart } from "../MonthlyChart";
import { SkeletonRows } from "../Skeleton";
import { SortableTh } from "../SortableTh";

export function HistorySection({
  incomeMonths,
  currency,
  loading,
  incomeClients,
  visibleIncomeClients,
  historyQuery,
  onHistoryQueryChange,
  historySort,
  onSort,
  onExportCsv,
  csvPending,
  expanded,
  onToggleExpanded,
  detail,
  money,
  sharedRate,
  defaultRate,
}: {
  incomeMonths: MonthlyIncome[];
  currency: string;
  loading: boolean;
  incomeClients: ClientIncome[];
  visibleIncomeClients: ClientIncome[];
  historyQuery: string;
  onHistoryQueryChange: (value: string) => void;
  historySort: SortState;
  onSort: (key: SortKey) => void;
  onExportCsv: () => void;
  csvPending: boolean;
  expanded: string | null;
  onToggleExpanded: (email: string) => void;
  detail: ClassDetail[];
  money: (value: number) => string;
  sharedRate: number;
  defaultRate: number;
}) {
  return (
    <>
      <section className="card">
        <h2>Clases por mes</h2>
        {incomeMonths.length === 0 ? (
          <p className="muted">Sin datos en el periodo.</p>
        ) : (
          <MonthlyChart data={incomeMonths} currency={currency} />
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Clases por cliente</h2>
          <div className="head-actions">
            <input
              type="search"
              className="search-input"
              placeholder="Buscar cliente…"
              value={historyQuery}
              onChange={(e) => onHistoryQueryChange(e.target.value)}
              aria-label="Buscar cliente"
            />
            <button type="button" className="ghost" onClick={onExportCsv} disabled={csvPending}>
              Exportar CSV
            </button>
          </div>
        </div>
        {loading ? (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                <SkeletonRows rows={4} cols={6} />
              </tbody>
            </table>
          </div>
        ) : incomeClients.length === 0 ? (
          <p className="muted">Sin clientes en el periodo seleccionado.</p>
        ) : visibleIncomeClients.length === 0 ? (
          <p className="muted">Ningún cliente coincide con «{historyQuery}».</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">
                Clases, horas e importe por cliente en el periodo
              </caption>
              <thead>
                <tr>
                  <SortableTh label="Cliente" sortKey="name" sort={historySort} onSort={onSort} />
                  <SortableTh label="Email" sortKey="email" sort={historySort} onSort={onSort} />
                  <SortableTh
                    label="Clases"
                    sortKey="classes"
                    sort={historySort}
                    onSort={onSort}
                    className="num"
                  />
                  <SortableTh
                    label="Importe"
                    sortKey="amount"
                    sort={historySort}
                    onSort={onSort}
                    className="num"
                  />
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {visibleIncomeClients.map((client) => (
                  <tr key={client.email}>
                    <td>{client.name}</td>
                    <td className="muted small">{client.email}</td>
                    <td className="num strong">{client.classes}</td>
                    <td className="num strong">{money(client.amount)}</td>
                    <td className="num">
                      <button
                        type="button"
                        className="link"
                        onClick={() => onToggleExpanded(client.email)}
                      >
                        {expanded === client.email ? "Ocultar" : "Ver clases"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">
          Solo lectura. Las tarifas se editan en la sección Clientes. Las clases compartidas usan{" "}
          {money(sharedRate)}/clase por alumno; el resto, la tarifa del cliente o la normal (
          {money(defaultRate)}/clase).
        </p>

        {expanded && (
          <div className="detail">
            <h3>Clases de {incomeClients.find((c) => c.email === expanded)?.name ?? expanded}</h3>
            {detail.length === 0 ? (
              <p className="muted">Sin clases registradas.</p>
            ) : (
              <div className="table-wrap">
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
                    {detail.map((row) => (
                      <tr key={row.id}>
                        <td>{formatDateTime(row.start_ts)}</td>
                        <td>{row.summary ?? "(sin título)"}</td>
                        <td className="num">
                          {row.duration_min != null ? `${row.duration_min} min` : "—"}
                        </td>
                        <td className="num">{money(row.rate)}</td>
                        <td className="num strong">{money(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}

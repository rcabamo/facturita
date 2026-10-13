import { Fragment } from "react";
import type { ClassDetail, ClientIncome } from "../../lib/api";
import { formatDateTime } from "../../lib/dates";
import type { SortKey, SortState } from "../../lib/sorting";
import { ClientNameInput } from "../InlineValue";
import { RateHistoryEditor } from "../RateHistoryEditor";
import { SkeletonRows } from "../Skeleton";
import { SortableTh } from "../SortableTh";

export function ClientsSection({
  allClients,
  visibleAllClients,
  loading,
  clientsQuery,
  onClientsQueryChange,
  clientsSort,
  onSort,
  selectedClient,
  onToggleClient,
  isPending,
  onChangeClientName,
  currency,
  defaultRate,
  notify,
  onRatesChanged,
  onClientClassesReload,
  clientClasses,
  money,
  onGoToImport,
}: {
  allClients: ClientIncome[];
  visibleAllClients: ClientIncome[];
  loading: boolean;
  clientsQuery: string;
  onClientsQueryChange: (value: string) => void;
  clientsSort: SortState;
  onSort: (key: SortKey) => void;
  selectedClient: string | null;
  onToggleClient: (email: string) => void;
  isPending: (key: string) => boolean;
  onChangeClientName: (email: string, name: string | null) => void;
  currency: string;
  defaultRate: number;
  notify?: (kind: "success" | "error" | "info", message: string) => void;
  onRatesChanged: () => void;
  onClientClassesReload: (email: string) => void;
  clientClasses: ClassDetail[];
  money: (value: number) => string;
  onGoToImport: () => void;
}) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Clientes ({allClients.length})</h2>
        <div className="head-actions">
          <span className="muted small">
            Clases e importe acumulados. La tarifa se edita al abrir el cliente.
          </span>
          <input
            type="search"
            className="search-input"
            placeholder="Buscar cliente…"
            value={clientsQuery}
            onChange={(e) => onClientsQueryChange(e.target.value)}
            aria-label="Buscar cliente"
          />
        </div>
      </div>
      {loading ? (
        <div className="table-wrap">
          <table className="table">
            <tbody>
              <SkeletonRows rows={4} cols={5} />
            </tbody>
          </table>
        </div>
      ) : allClients.length === 0 ? (
        <div className="empty">
          <p className="muted">Aún no hay clientes.</p>
          <button type="button" onClick={onGoToImport}>
            Ir a Importación
          </button>
        </div>
      ) : visibleAllClients.length === 0 ? (
        <p className="muted">Ningún cliente coincide con «{clientsQuery}».</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Clientes con horas e importe acumulados</caption>
            <thead>
              <tr>
                <SortableTh label="Nombre" sortKey="name" sort={clientsSort} onSort={onSort} />
                <SortableTh label="Email" sortKey="email" sort={clientsSort} onSort={onSort} />
                <SortableTh
                  label="Clases"
                  sortKey="classes"
                  sort={clientsSort}
                  onSort={onSort}
                  className="num"
                />
                <SortableTh
                  label="Importe"
                  sortKey="amount"
                  sort={clientsSort}
                  onSort={onSort}
                  className="num"
                />
              </tr>
            </thead>
            <tbody>
              {visibleAllClients.map((client) => {
                const open = selectedClient === client.email;
                return (
                  <Fragment key={client.email}>
                    <tr
                      className="client-row"
                      tabIndex={0}
                      aria-expanded={open}
                      onClick={() => onToggleClient(client.email)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onToggleClient(client.email);
                        }
                      }}
                    >
                      {/* biome-ignore lint/a11y/useKeyWithClickEvents: solo detiene la propagación del clic, no es una acción */}
                      <td onClick={(event) => event.stopPropagation()}>
                        <ClientNameInput
                          value={client.name}
                          placeholder={client.email}
                          disabled={isPending(`name:${client.email}`)}
                          onCommit={(name) => onChangeClientName(client.email, name)}
                        />
                      </td>
                      <td className="muted small">{client.email}</td>
                      <td className="num strong">{client.classes}</td>
                      <td className="num strong">{money(client.amount)}</td>
                    </tr>
                    {open && (
                      <tr className="row-detail">
                        <td colSpan={4}>
                          <div className="detail-head">
                            <h3>Clases de {client.name}</h3>
                          </div>
                          <RateHistoryEditor
                            email={client.email}
                            currency={currency}
                            defaultRate={defaultRate}
                            notify={notify}
                            onChanged={() => {
                              onRatesChanged();
                              onClientClassesReload(client.email);
                            }}
                          />
                          {clientClasses.length === 0 ? (
                            <p className="muted">Sin clases registradas.</p>
                          ) : (
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
                                {clientClasses.map((row) => (
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
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

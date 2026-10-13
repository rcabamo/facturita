import { Fragment } from "react";
import type { ClassDetail, ClientIncome } from "../../lib/api";
import type { SortKey, SortState } from "../../lib/sorting";
import { ClassDetailTable } from "../ClassDetailTable";
import { ClientRow } from "../ClientRow";
import { ClientNameInput } from "../InlineValue";
import { ReceiptIcon } from "../icons";
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
  onInvoice,
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
  onInvoice: (email: string) => void;
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
                    <ClientRow
                      name={
                        <ClientNameInput
                          value={client.name}
                          placeholder={client.email}
                          disabled={isPending(`name:${client.email}`)}
                          onCommit={(name) => onChangeClientName(client.email, name)}
                        />
                      }
                      email={client.email}
                      classes={client.classes}
                      amount={money(client.amount)}
                      open={open}
                      onToggle={() => onToggleClient(client.email)}
                      stopNamePropagation
                    />
                    {open && (
                      <tr className="row-detail">
                        <td colSpan={4}>
                          <div className="detail-head">
                            <h3>Clases de {client.name}</h3>
                            <button
                              type="button"
                              className="with-icon"
                              onClick={() => onInvoice(client.email)}
                            >
                              <ReceiptIcon size={16} />
                              Emitir factura
                            </button>
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
                          <ClassDetailTable rows={clientClasses} money={money} />
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

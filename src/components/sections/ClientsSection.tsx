import { useMemo } from "react";
import type {
  ClassDetail,
  ClientAlias,
  ClientIncome,
  EmailSuggestion,
  InvoiceRecord,
} from "../../lib/api";
import { groupClassesByInvoice } from "../../lib/invoiceGroups";
import type { SortKey, SortState } from "../../lib/sorting";
import { type ClassDetailRow, ClassDetailTable } from "../ClassDetailTable";
import { ClientBillingEditor } from "../ClientBillingEditor";
import { ClientEmailsEditor } from "../ClientEmailsEditor";
import type { ConfirmOptions } from "../ConfirmDialog";
import { ClientNameInput } from "../InlineValue";
import { PlusIcon, ReceiptIcon, TrashIcon, UsersIcon } from "../icons";
import { RateHistoryEditor } from "../RateHistoryEditor";
import { SkeletonRows } from "../Skeleton";

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
  clientClassesLoading = false,
  money,
  onGoToImport,
  onInvoice,
  onOpenInvoice,
  onNewClient,
  onDeleteClient,
  confirm,
  aliases = [],
  emailSuggestions = [],
  invoices = [],
  onLinkAlias,
  onUnlinkAlias,
  onChangeClassRate,
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
  clientClassesLoading?: boolean;
  money: (value: number) => string;
  onGoToImport: () => void;
  onInvoice: (email: string) => void;
  /** Abre la ficha de una factura ya emitida. */
  onOpenInvoice: (id: number) => void;
  /** Abre el diálogo de alta manual de un cliente. */
  onNewClient: () => void;
  /** Elimina un cliente creado a mano. */
  onDeleteClient: (email: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Emails vinculados a cada cliente (varios emails = un mismo cliente). */
  aliases?: ClientAlias[];
  /** Emails del calendario para autocompletar el alta de un vínculo. */
  emailSuggestions?: EmailSuggestion[];
  /** Facturas emitidas (para el pendiente de cobro del cliente). */
  invoices?: InvoiceRecord[];
  onLinkAlias?: (email: string, clientEmail: string) => void;
  onUnlinkAlias?: (email: string) => void;
  onChangeClassRate?: (row: ClassDetailRow, rate: number | null) => void;
}) {
  const selected = selectedClient
    ? (allClients.find((client) => client.email === selectedClient) ?? null)
    : null;
  const linkedEmails = selected
    ? aliases.filter((alias) => alias.client_email === selected.email).length
    : 0;
  const classGroups = useMemo(() => groupClassesByInvoice(clientClasses), [clientClasses]);
  const pendingInvoices = useMemo(() => {
    if (!selected) return [];
    const email = selected.email.toLowerCase();
    return invoices.filter(
      (invoice) =>
        invoice.client_email.toLowerCase() === email && !invoice.voided && invoice.paid_on == null,
    );
  }, [invoices, selected]);
  const pendingAmount = pendingInvoices.reduce((sum, invoice) => sum + invoice.total, 0);

  /** Los clientes creados a mano sin email muestran solo su nombre. */
  function visibleEmail(client: ClientIncome): string | null {
    if (client.manual && !client.email.includes("@")) return null;
    return client.email;
  }

  async function removeClient(client: ClientIncome) {
    const ok = await confirm({
      title: "Eliminar cliente",
      message: `¿Eliminar «${client.name}»? Solo se puede si no tiene emails vinculados. Las clases no se tocan.`,
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (ok) onDeleteClient(client.email);
  }

  return (
    <section className="card clients-card">
      <div className="card-head">
        <h2>Clientes ({allClients.length})</h2>
        <div className="head-actions">
          <input
            type="search"
            className="search-input"
            placeholder="Buscar cliente…"
            value={clientsQuery}
            onChange={(e) => onClientsQueryChange(e.target.value)}
            aria-label="Buscar cliente"
          />
          <button type="button" className="ghost with-icon" onClick={onNewClient}>
            <PlusIcon size={16} />
            Nuevo cliente
          </button>
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
        <>
          <div className="clients-sort-bar">
            <span className="muted small">Ordenar por</span>
            {(
              [
                ["name", "Nombre"],
                ["email", "Email"],
                ["classes", "Clases"],
                ["amount", "Importe"],
              ] as const
            ).map(([key, label]) => {
              const active = clientsSort.key === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={active ? "sort-chip active" : "sort-chip"}
                  aria-pressed={active}
                  onClick={() => onSort(key)}
                >
                  {label}
                  <span className="sort-caret" aria-hidden>
                    {active ? (clientsSort.dir === "asc" ? "↑" : "↓") : "↕"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="clients-layout">
            <ul className="client-list" aria-label="Clientes">
              {visibleAllClients.map((client) => {
                const open = selectedClient === client.email;
                const email = visibleEmail(client);
                const showEmail =
                  email != null && client.name.toLowerCase() !== email.toLowerCase();
                return (
                  <li key={client.email}>
                    <button
                      type="button"
                      className={open ? "client-list-item active" : "client-list-item"}
                      aria-current={open ? "true" : undefined}
                      onClick={() => onToggleClient(client.email)}
                    >
                      <span className="client-list-main">
                        <span className="client-list-name">
                          {client.name}
                          {client.manual && <span className="badge manual">manual</span>}
                        </span>
                        {showEmail && <span className="client-list-email">{email}</span>}
                      </span>
                      <span className="client-list-meta">
                        <span className="muted small">
                          {client.classes} clase{client.classes === 1 ? "" : "s"}
                        </span>
                        <span className="client-list-amount">{money(client.amount)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="client-detail-panel">
              {selected ? (
                <>
                  <div className="client-detail-head">
                    <div className="client-detail-title">
                      <ClientNameInput
                        value={selected.name}
                        placeholder={selected.name || selected.email}
                        disabled={isPending(`name:${selected.email}`)}
                        onCommit={(name) => onChangeClientName(selected.email, name)}
                      />
                      <p className="muted small">
                        {visibleEmail(selected) ??
                          (selected.manual ? "Cliente creado a mano" : selected.email)}
                        {selected.manual && <span className="badge manual">manual</span>}
                        {linkedEmails > 0 &&
                          ` · ${linkedEmails} email${linkedEmails === 1 ? "" : "s"} vinculado${
                            linkedEmails === 1 ? "" : "s"
                          }`}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="with-icon"
                      onClick={() => onInvoice(selected.email)}
                    >
                      <ReceiptIcon size={16} />
                      Emitir factura
                    </button>
                  </div>

                  <div className="client-detail-stats">
                    <div>
                      <span className="muted small">Clases</span>
                      <strong>{selected.classes}</strong>
                    </div>
                    <div>
                      <span className="muted small">Importe acumulado</span>
                      <strong>{money(selected.amount)}</strong>
                    </div>
                    <div>
                      <span className="muted small">Tarifa actual</span>
                      <strong>
                        {selected.rate != null
                          ? money(selected.rate)
                          : `${money(defaultRate)} (normal)`}
                      </strong>
                    </div>
                    <div>
                      <span className="muted small">Pendiente de cobro</span>
                      <strong className={pendingAmount > 0 ? "pending-amount" : undefined}>
                        {money(pendingAmount)}
                      </strong>
                      {pendingInvoices.length > 0 && (
                        <span className="muted small">
                          {pendingInvoices.length} factura{pendingInvoices.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="client-billing">
                    <div className="client-tool-head">
                      <h3>Datos de facturación</h3>
                    </div>
                    <ClientBillingEditor email={selected.email} notify={notify} />
                  </div>

                  <div className="client-detail-tools">
                    <div className="client-tool">
                      <div className="client-tool-head">
                        <h3>Tarifa del cliente</h3>
                      </div>
                      <RateHistoryEditor
                        email={selected.email}
                        currency={currency}
                        defaultRate={defaultRate}
                        notify={notify}
                        onChanged={() => {
                          onRatesChanged();
                          onClientClassesReload(selected.email);
                        }}
                      />
                    </div>
                    <div className="client-tool">
                      <div className="client-tool-head">
                        <h3>Emails del cliente</h3>
                      </div>
                      <ClientEmailsEditor
                        clientEmail={selected.email}
                        aliases={aliases}
                        suggestions={emailSuggestions}
                        busy={isPending(`alias:${selected.email}`)}
                        onLink={(email, clientEmail) => onLinkAlias?.(email, clientEmail)}
                        onUnlink={(email) => onUnlinkAlias?.(email)}
                      />
                    </div>
                  </div>

                  <div className="client-classes">
                    <div className="client-classes-head">
                      <div>
                        <h3>Clases</h3>
                        <p className="muted small">
                          Pulsa la tarifa de una clase para fijar un precio/hora especial solo en
                          esa clase. ↺ vuelve a la tarifa automática.
                        </p>
                      </div>
                    </div>
                    {clientClassesLoading ? (
                      <p className="muted small">Cargando clases…</p>
                    ) : classGroups.length === 0 ? (
                      <p className="muted">Sin clases registradas.</p>
                    ) : (
                      <div className="invoice-groups">
                        {classGroups.map((group) => (
                          <section key={group.key} className="invoice-group">
                            <div className="invoice-group-head">
                              <span className="invoice-group-title">
                                {group.invoiceId != null ? (
                                  <button
                                    type="button"
                                    className="link with-icon"
                                    onClick={() => onOpenInvoice(group.invoiceId as number)}
                                    title="Ver la factura asociada"
                                  >
                                    <ReceiptIcon size={15} />
                                    Factura {group.invoiceNumber}
                                  </button>
                                ) : (
                                  <span className="muted">Sin facturar</span>
                                )}
                              </span>
                              <span className="muted small">
                                {group.rows.length} clase{group.rows.length === 1 ? "" : "s"} ·{" "}
                                {money(group.total)}
                              </span>
                            </div>
                            <div className="table-wrap">
                              <ClassDetailTable
                                rows={group.rows}
                                money={money}
                                symbol={currency}
                                onChangeRate={onChangeClassRate}
                              />
                            </div>
                          </section>
                        ))}
                      </div>
                    )}
                  </div>

                  {selected.manual && (
                    <div className="client-danger">
                      <button
                        type="button"
                        className="link danger with-icon"
                        disabled={linkedEmails > 0 || isPending(`client:delete:${selected.email}`)}
                        title={
                          linkedEmails > 0
                            ? "Separa antes los emails vinculados"
                            : "Eliminar este cliente"
                        }
                        onClick={() => void removeClient(selected)}
                      >
                        <TrashIcon size={15} />
                        Eliminar cliente manual
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="client-detail-empty">
                  <UsersIcon size={30} />
                  <p>
                    <strong>Selecciona un cliente</strong>
                  </p>
                  <p className="muted small">
                    Verás su tarifa, sus emails vinculados y todas sus clases.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

import type { CalendarEntry, ClassGroup } from "../../lib/api";
import type { DateRange } from "../../lib/dates";
import { formatDateTime, formatRangeLabel, formatTimestamp } from "../../lib/dates";
import { type ClassFilter, type Review, shiftMonth } from "../../lib/view";
import type { ConfirmOptions } from "../ConfirmDialog";
import { DateRangePicker } from "../DateRangePicker";
import { ImportIcon } from "../icons";
import { SkeletonRows } from "../Skeleton";

export type { ClassFilter, Review };

export function ImportSection({
  syncCollapsed,
  onToggleSyncCollapsed,
  importRange,
  onImportRangeChange,
  selectedCalendarCount,
  lastSync,
  calendars,
  onToggleCalendar,
  onSync,
  busy,
  classes,
  visibleClasses,
  loading,
  pendingCount,
  staleCount,
  cancelledCount,
  autoSyncing,
  classFilter,
  onClassFilterChange,
  selectedEvents,
  selectedVisibleCount,
  isPending,
  onReviewEvent,
  onSetEventBilling,
  onSetCancelledIncluded,
  onReviewSelected,
  onToggleEventSelection,
  onToggleSelectVisible,
  onClearSelection,
  onAcceptImport,
  money,
  confirm,
}: {
  syncCollapsed: boolean;
  onToggleSyncCollapsed: () => void;
  importRange: DateRange;
  onImportRangeChange: (range: DateRange) => void;
  selectedCalendarCount: number;
  lastSync: string | null;
  calendars: CalendarEntry[];
  onToggleCalendar: (id: string) => void;
  onSync: () => void;
  busy: boolean;
  classes: ClassGroup[];
  visibleClasses: ClassGroup[];
  loading: boolean;
  pendingCount: number;
  staleCount: number;
  cancelledCount: number;
  autoSyncing: boolean;
  classFilter: ClassFilter;
  onClassFilterChange: (filter: ClassFilter) => void;
  selectedEvents: Set<string>;
  selectedVisibleCount: number;
  isPending: (key: string) => boolean;
  onReviewEvent: (id: string, review: Review) => void;
  onSetEventBilling: (id: string, emails: string[]) => void;
  onSetCancelledIncluded: (id: string, included: boolean) => void;
  onReviewSelected: (review: Review) => void;
  onToggleEventSelection: (id: string) => void;
  onToggleSelectVisible: () => void;
  onClearSelection: () => void;
  onAcceptImport: () => void;
  money: (value: number) => string;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}) {
  return (
    <>
      <section className={syncCollapsed ? "card collapsed" : "card"}>
        <div className="card-head">
          <button
            type="button"
            className="collapse-toggle"
            aria-expanded={!syncCollapsed}
            aria-controls="sync-body"
            onClick={onToggleSyncCollapsed}
          >
            <span className="caret" aria-hidden>
              ▾
            </span>
            <h2>Importar clases</h2>
            {syncCollapsed && (
              <span className="muted small collapse-summary">
                {formatRangeLabel(importRange.from, importRange.to)}
                {selectedCalendarCount > 0 &&
                  ` · ${selectedCalendarCount} calendario${selectedCalendarCount === 1 ? "" : "s"}`}
              </span>
            )}
          </button>
          <button type="button" className="with-icon" onClick={onSync} disabled={busy}>
            <ImportIcon size={16} />
            {busy ? "Importando…" : "Importar"}
          </button>
        </div>
        {!syncCollapsed && (
          <div id="sync-body" className="collapse-body">
            <div className="field">
              {/* biome-ignore lint/a11y/noLabelWithoutControl: etiqueta para un selector de rango personalizado */}
              <label>Periodo a importar</label>
              <div className="range-nav">
                <button
                  type="button"
                  className="ghost nav-btn"
                  aria-label="Mes anterior"
                  onClick={() => onImportRangeChange(shiftMonth(importRange, -1))}
                >
                  ‹
                </button>
                <DateRangePicker value={importRange} onChange={onImportRangeChange} presets />
                <button
                  type="button"
                  className="ghost nav-btn"
                  aria-label="Mes siguiente"
                  onClick={() => onImportRangeChange(shiftMonth(importRange, 1))}
                >
                  ›
                </button>
              </div>
            </div>
            <p className="muted small">
              Se importarán las clases de este periodo desde los calendarios seleccionados; después
              aparecerán abajo para revisarlas.
            </p>
            {lastSync && (
              <p className="muted small">Última importación: {formatTimestamp(lastSync)}</p>
            )}
            <div className="calendar-list">
              {calendars.map((cal) => (
                <label key={cal.id} className="calendar-item">
                  <input
                    type="checkbox"
                    checked={cal.selected}
                    onChange={() => onToggleCalendar(cal.id)}
                  />
                  <span>
                    {cal.summary} {cal.primary && <em className="muted">(principal)</em>}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Clases importadas</h2>
          <div className="head-actions">
            <span className="muted small">
              {formatRangeLabel(importRange.from, importRange.to)}
            </span>
            {autoSyncing ? (
              <span className="muted small">Sincronizando…</span>
            ) : (
              <span className="muted small">
                {pendingCount} pendiente{pendingCount === 1 ? "" : "s"} de revisar
              </span>
            )}
            {cancelledCount > 0 && (
              <span className="muted small cancelled-hint">
                {cancelledCount} cancelada{cancelledCount === 1 ? "" : "s"} sin incluir
              </span>
            )}
            {staleCount > 0 && (
              <span className="muted small stale-hint">
                {staleCount} ya no aparece{staleCount === 1 ? "" : "n"} en Google
              </span>
            )}
            <button type="button" onClick={onAcceptImport} disabled={busy || pendingCount === 0}>
              Aceptar todo{pendingCount > 0 ? ` (${pendingCount})` : ""}
            </button>
          </div>
        </div>

        <div className="table-toolbar">
          {/* biome-ignore lint/a11y/useSemanticElements: grupo de filtros segmentados */}
          <div className="segmented" role="group" aria-label="Filtrar clases por estado">
            {(
              [
                ["all", "Todas"],
                ["pending", "Pendientes"],
                ["accepted", "Aceptadas"],
                ["cancelled", "Canceladas"],
                ["discarded", "Descartadas"],
                ["stale", "Ya no cuentan"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={classFilter === value ? "seg active" : "seg"}
                aria-pressed={classFilter === value}
                onClick={() => onClassFilterChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {selectedVisibleCount > 0 && classFilter !== "cancelled" && (
            <div className="bulk-actions">
              <span className="muted small">{selectedVisibleCount} seleccionadas</span>
              <button
                type="button"
                className="ghost"
                disabled={isPending("bulk")}
                onClick={() => onReviewSelected("accepted")}
              >
                Aceptar
              </button>
              <button
                type="button"
                className="ghost"
                disabled={isPending("bulk")}
                onClick={() => onReviewSelected("discarded")}
              >
                Descartar
              </button>
              <button type="button" className="link" onClick={onClearSelection}>
                Quitar selección
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                <SkeletonRows rows={5} cols={8} />
              </tbody>
            </table>
          </div>
        ) : classes.length === 0 ? (
          <div className="empty">
            <p className="muted">
              No hay clases importadas en {formatRangeLabel(importRange.from, importRange.to)}.
            </p>
            <button type="button" className="with-icon" onClick={onSync} disabled={busy}>
              <ImportIcon size={16} />
              {busy ? "Importando…" : "Importar clases"}
            </button>
          </div>
        ) : visibleClasses.length === 0 ? (
          <p className="muted">No hay clases con ese filtro.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Clases importadas en el periodo seleccionado</caption>
              <thead>
                <tr>
                  <th scope="col" className="sel">
                    {classFilter !== "cancelled" && (
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todas las clases visibles"
                        checked={
                          visibleClasses.length > 0 &&
                          selectedVisibleCount === visibleClasses.length
                        }
                        onChange={onToggleSelectVisible}
                      />
                    )}
                  </th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Clase</th>
                  <th scope="col">Alumnos</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="num">
                    Duración
                  </th>
                  <th scope="col" className="num">
                    Importe
                  </th>
                  <th scope="col" className="num">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleClasses.map((item) => {
                  const rowPending =
                    isPending(`review:${item.id}`) ||
                    isPending(`billing:${item.id}`) ||
                    isPending(`cancelled:${item.id}`);
                  const checked = selectedEvents.has(item.id);
                  const billableEmails = item.clients
                    .filter((client) => client.billable)
                    .map((client) => client.email);
                  const allBillable = billableEmails.length === item.clients.length;
                  return (
                    <tr
                      key={item.id}
                      className={
                        item.discarded ? "row-discarded" : item.stale ? "row-stale" : undefined
                      }
                    >
                      <td className="sel">
                        {classFilter !== "cancelled" && (
                          <input
                            type="checkbox"
                            checked={checked}
                            aria-label={`Seleccionar ${item.summary ?? "clase"}`}
                            onChange={() => onToggleEventSelection(item.id)}
                          />
                        )}
                      </td>
                      <td className="nowrap">{formatDateTime(item.start_ts)}</td>
                      <td>{item.summary ?? "(sin título)"}</td>
                      <td>
                        <div className="chips">
                          {item.clients.map((client) => (
                            <button
                              key={client.email}
                              type="button"
                              className={client.billable ? "chip" : "chip excluded"}
                              aria-pressed={client.billable}
                              disabled={rowPending}
                              title={
                                client.billable
                                  ? item.clients.length > 1
                                    ? "Cuenta en esta clase. Pulsa para excluirlo."
                                    : "Cuenta en esta clase."
                                  : "Invitado que no cuenta en esta clase. Pulsa para incluirlo."
                              }
                              onClick={() => {
                                if (client.billable) {
                                  if (billableEmails.length <= 1) return;
                                  void onSetEventBilling(
                                    item.id,
                                    billableEmails.filter((email) => email !== client.email),
                                  );
                                } else {
                                  void onSetEventBilling(item.id, [
                                    ...billableEmails,
                                    client.email,
                                  ]);
                                }
                              }}
                            >
                              {client.name}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td>
                        {item.clients.length > 1 ? (
                          <select
                            className="billing-select"
                            aria-label={`Alumnos que cuentan en «${item.summary ?? "la clase"}»`}
                            value={
                              allBillable
                                ? ""
                                : billableEmails.length === 1
                                  ? billableEmails[0]
                                  : "__partial"
                            }
                            disabled={rowPending}
                            onChange={(event) => {
                              const value = event.target.value;
                              if (value === "__partial") return;
                              const emails =
                                value === "" ? item.clients.map((client) => client.email) : [value];
                              void onSetEventBilling(item.id, emails);
                            }}
                          >
                            <option value="">Compartida (todos)</option>
                            {!allBillable && billableEmails.length > 1 && (
                              <option value="__partial">
                                Compartida · {billableEmails.length} alumnos
                              </option>
                            )}
                            {item.clients.map((client) => (
                              <option key={client.email} value={client.email}>
                                Individual · {client.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="badge single">Individual</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            item.discarded
                              ? "badge discarded"
                              : item.stale
                                ? "badge stale"
                                : item.cancelled
                                  ? item.included
                                    ? "badge cancelled included"
                                    : "badge cancelled"
                                  : item.accepted
                                    ? "badge accepted"
                                    : "badge pending"
                          }
                        >
                          {item.discarded
                            ? "Descartada"
                            : item.stale
                              ? "Ya no aparece en Google"
                              : item.cancelled
                                ? item.included
                                  ? "Cancelada · incluida"
                                  : "Cancelada en Google"
                                : item.accepted
                                  ? "Aceptada"
                                  : "Pendiente"}
                        </span>
                      </td>
                      <td className="num">
                        {item.duration_min != null ? `${item.duration_min} min` : "—"}
                      </td>
                      <td className={item.cancelled && !item.included ? "num muted" : "num strong"}>
                        {money(item.total_amount)}
                      </td>
                      <td className="num actions">
                        {item.discarded ? (
                          <button
                            type="button"
                            className="link"
                            disabled={rowPending}
                            onClick={() => onReviewEvent(item.id, "restored")}
                          >
                            Restaurar
                          </button>
                        ) : item.stale ? (
                          <button
                            type="button"
                            className="link"
                            disabled={rowPending}
                            onClick={() => onReviewEvent(item.id, "discarded")}
                          >
                            Descartar
                          </button>
                        ) : item.cancelled ? (
                          <button
                            type="button"
                            className={item.included ? "link danger" : "link"}
                            disabled={rowPending}
                            onClick={() => onSetCancelledIncluded(item.id, !item.included)}
                          >
                            {item.included ? "No incluir" : "Incluir en el cómputo"}
                          </button>
                        ) : item.accepted ? (
                          <button
                            type="button"
                            className="link danger"
                            disabled={rowPending}
                            onClick={async () => {
                              const ok = await confirm({
                                title: "Descartar clase",
                                message: `«${item.summary ?? "La clase"}» dejará de contar en el Histórico.`,
                                confirmLabel: "Descartar",
                                danger: true,
                              });
                              if (!ok) return;
                              void onReviewEvent(item.id, "discarded");
                            }}
                          >
                            Descartar
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="link"
                              disabled={rowPending}
                              onClick={() => onReviewEvent(item.id, "accepted")}
                            >
                              Aceptar
                            </button>
                            <button
                              type="button"
                              className="link danger"
                              disabled={rowPending}
                              onClick={() => onReviewEvent(item.id, "discarded")}
                            >
                              Descartar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

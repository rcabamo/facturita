import type { CalendarEntry, ClassGroup } from "../../lib/api";
import type { DateRange } from "../../lib/dates";
import { formatDateTime, formatRangeLabel, formatTimestamp } from "../../lib/dates";
import { shiftMonth } from "../../lib/view";
import type { ConfirmOptions } from "../ConfirmDialog";
import { DateRangePicker } from "../DateRangePicker";
import { ImportIcon } from "../icons";
import { SkeletonRows } from "../Skeleton";

export type ClassFilter = "all" | "pending" | "accepted" | "discarded";
export type Review = "accepted" | "discarded" | "pending";

export function ImportSection({
  onboardingDismissed,
  noClients,
  onDismissOnboarding,
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
  classFilter,
  onClassFilterChange,
  selectedEvents,
  selectedVisibleCount,
  isPending,
  onReviewEvent,
  onReviewSelected,
  onToggleEventSelection,
  onToggleSelectVisible,
  onClearSelection,
  onAcceptImport,
  money,
  confirm,
}: {
  onboardingDismissed: boolean;
  noClients: boolean;
  onDismissOnboarding: () => void;
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
  classFilter: ClassFilter;
  onClassFilterChange: (filter: ClassFilter) => void;
  selectedEvents: Set<string>;
  selectedVisibleCount: number;
  isPending: (key: string) => boolean;
  onReviewEvent: (id: string, review: Review) => void;
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
      {!onboardingDismissed && noClients && (
        <section className="card onboarding">
          <div className="onboarding-head">
            <h2>Primeros pasos</h2>
            <button
              type="button"
              className="alert-close"
              aria-label="Ocultar primeros pasos"
              onClick={onDismissOnboarding}
            >
              ×
            </button>
          </div>
          <ol className="onboarding-steps">
            <li>
              Pulsa <strong>Importar</strong> y elige el periodo que quieras traer.
            </li>
            <li>
              <strong>Revisa</strong> las clases importadas y ajusta las tarifas si hace falta.
            </li>
            <li>
              Pulsa <strong>Aceptar todo</strong> para agregarlas al Histórico y a los importes por
              cliente.
            </li>
          </ol>
        </section>
      )}
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
              {pendingCount} pendiente{pendingCount === 1 ? "" : "s"} de revisar
            </span>
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
                ["discarded", "Descartadas"],
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
          {selectedVisibleCount > 0 && (
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
            <p className="muted">Todavía no has importado ninguna clase.</p>
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
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todas las clases visibles"
                      checked={
                        visibleClasses.length > 0 && selectedVisibleCount === visibleClasses.length
                      }
                      onChange={onToggleSelectVisible}
                    />
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
                  const rowPending = isPending(`review:${item.id}`);
                  const checked = selectedEvents.has(item.id);
                  return (
                    <tr key={item.id} className={item.discarded ? "row-discarded" : undefined}>
                      <td className="sel">
                        <input
                          type="checkbox"
                          checked={checked}
                          aria-label={`Seleccionar ${item.summary ?? "clase"}`}
                          onChange={() => onToggleEventSelection(item.id)}
                        />
                      </td>
                      <td className="nowrap">{formatDateTime(item.start_ts)}</td>
                      <td>{item.summary ?? "(sin título)"}</td>
                      <td>
                        <div className="chips">
                          {item.clients.map((client) => (
                            <span key={client.email} className="chip">
                              {client.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className={item.shared ? "badge shared" : "badge single"}>
                          {item.shared ? "Compartida" : "Individual"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            item.discarded
                              ? "badge discarded"
                              : item.accepted
                                ? "badge accepted"
                                : "badge pending"
                          }
                        >
                          {item.discarded ? "Descartada" : item.accepted ? "Aceptada" : "Pendiente"}
                        </span>
                      </td>
                      <td className="num">
                        {item.duration_min != null ? `${item.duration_min} min` : "—"}
                      </td>
                      <td className="num strong">{money(item.total_amount)}</td>
                      <td className="num actions">
                        {item.discarded ? (
                          <button
                            type="button"
                            className="link"
                            disabled={rowPending}
                            onClick={() => onReviewEvent(item.id, "pending")}
                          >
                            Restaurar
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

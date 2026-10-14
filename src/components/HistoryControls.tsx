import type { MonthlyIncome } from "../lib/api";
import { type DateRange, formatMonth } from "../lib/dates";
import { deltaClass, formatDelta, shiftMonth } from "../lib/view";
import { DateRangePicker } from "./DateRangePicker";

export interface PrevDelta {
  classesDelta: number | null;
  incomeDelta: number | null;
}

export function HistoryControls({
  range,
  onRangeChange,
  totalClasses,
  studentCount,
  totalIncome,
  money,
  prevTotals,
  prevDelta,
}: {
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
  totalClasses: number;
  studentCount: number;
  totalIncome: number;
  money: (value: number) => string;
  prevTotals: MonthlyIncome | null;
  prevDelta: PrevDelta | null;
}) {
  return (
    <section className="card controls">
      <div className="field">
        {/* biome-ignore lint/a11y/noLabelWithoutControl: etiqueta para un selector de rango personalizado */}
        <label>Periodo</label>
        <div className="range-nav">
          <button
            type="button"
            className="ghost nav-btn"
            aria-label="Mes anterior"
            onClick={() => onRangeChange(shiftMonth(range, -1))}
          >
            ‹
          </button>
          <DateRangePicker value={range} onChange={onRangeChange} presets />
          <button
            type="button"
            className="ghost nav-btn"
            aria-label="Mes siguiente"
            onClick={() => onRangeChange(shiftMonth(range, 1))}
          >
            ›
          </button>
        </div>
      </div>
      <div className="controls-actions statement-inline">
        <div className="statement-figures">
          <div className="figure">
            <span className="figure-value">{totalClasses}</span>
            <span className="figure-label">clases</span>
          </div>
          <div className="figure">
            <span className="figure-value">{studentCount}</span>
            <span className="figure-label">alumnos</span>
          </div>
          <div className="figure money">
            <span className="figure-value">{money(totalIncome)}</span>
            <span className="figure-label">por cobrar</span>
          </div>
        </div>
        {prevDelta && (prevDelta.classesDelta != null || prevDelta.incomeDelta != null) && (
          <p className="statement-delta muted small">
            {prevTotals?.month ? `vs. ${formatMonth(prevTotals.month)}: ` : ""}
            {prevDelta.classesDelta != null && (
              <span className={deltaClass(prevDelta.classesDelta)}>
                clases {formatDelta(prevDelta.classesDelta)}
              </span>
            )}
            {prevDelta.classesDelta != null && prevDelta.incomeDelta != null && " · "}
            {prevDelta.incomeDelta != null && (
              <span className={deltaClass(prevDelta.incomeDelta)}>
                importe {formatDelta(prevDelta.incomeDelta)}
              </span>
            )}
          </p>
        )}
      </div>
    </section>
  );
}

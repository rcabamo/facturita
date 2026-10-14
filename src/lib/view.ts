import { type DateRange, firstDayOfMonth, lastDayOfMonth, today, yearMonthOf } from "./dates";

export const ALL_FROM = "2000-01-01";
export const ALL_TO = "2999-12-31";

export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function endDateForMonth(yearMonth: string): string {
  const { year, month } = yearMonthOf(yearMonth);
  const now = new Date();
  if (year === now.getFullYear() && month === now.getMonth()) {
    return today();
  }
  return lastDayOfMonth(year, month);
}

export function monthRange(yearMonth: string): DateRange {
  const { year, month } = yearMonthOf(yearMonth);
  return {
    from: firstDayOfMonth(year, month),
    to: endDateForMonth(yearMonth),
  };
}

export function isRange(value: unknown): value is DateRange {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as DateRange).from === "string" &&
    typeof (value as DateRange).to === "string"
  );
}

export function shiftMonth(range: DateRange, delta: number): DateRange {
  const { year, month } = yearMonthOf(range.from);
  const shifted = new Date(year, month + delta, 1);
  const ym = `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
  return monthRange(ym);
}

export function singleMonthOf(range: DateRange): string | null {
  const { year, month } = yearMonthOf(range.from);
  if (range.from !== firstDayOfMonth(year, month)) return null;
  const { year: toYear, month: toMonth } = yearMonthOf(range.to);
  if (toYear !== year || toMonth !== month) return null;
  return range.from.slice(0, 7);
}

export function formatDelta(value: number): string {
  if (Math.abs(value) < 0.5) return "0 %";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value)} %`;
}

export function deltaClass(value: number): string {
  if (Math.abs(value) < 0.5) return "delta flat";
  return value > 0 ? "delta up" : "delta down";
}

export type Section = "import" | "history" | "clients" | "settings" | "billing";

export type ClassFilter = "all" | "pending" | "accepted" | "discarded";

export type Review = "accepted" | "discarded" | "pending";

export type Theme = "system" | "light" | "dark";

export const SECTION_LABELS: Record<Section, string> = {
  import: "Importación",
  history: "Histórico",
  clients: "Clientes",
  settings: "Ajustes",
  billing: "Facturación",
};

export const DEFAULT_SECTION_ORDER: Section[] = [
  "history",
  "clients",
  "billing",
  "import",
  "settings",
];

export function normalizeSectionOrder(value: unknown): Section[] | null {
  if (!Array.isArray(value)) return null;
  const valid = value.filter(
    (item): item is Section =>
      item === "import" ||
      item === "history" ||
      item === "clients" ||
      item === "settings" ||
      item === "billing",
  );
  if (valid.length !== DEFAULT_SECTION_ORDER.length) return null;
  if (new Set(valid).size !== DEFAULT_SECTION_ORDER.length) return null;
  return valid;
}

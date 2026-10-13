export function isoDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseIsoDay(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function today(): string {
  return isoDay(new Date());
}

export function yearMonthOf(value: string): { year: number; month: number } {
  const [year, month] = value.split("-").map(Number);
  return { year, month: month - 1 };
}

export function firstDayOfMonth(year: number, month: number): string {
  return isoDay(new Date(year, month, 1));
}

export function lastDayOfMonth(year: number, month: number): string {
  return isoDay(new Date(year, month + 1, 0));
}

export function defaultFrom(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 11);
  date.setDate(1);
  return isoDay(date);
}

function parseUtc(value: string): Date {
  const normalized = /\dT\d{2}:\d{2}:\d{2}$/.test(value) ? `${value}Z` : value;
  return new Date(normalized);
}

export function formatDateTime(value: string): string {
  return parseUtc(value).toLocaleString("es-ES", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: string): string {
  return parseUtc(value).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatTimestamp(value: string): string {
  return parseUtc(value).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMonth(month: string): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const label = new Date(year, monthIndex - 1, 1).toLocaleDateString("es-ES", {
    month: "short",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export interface DateRange {
  from: string;
  to: string;
}

export function formatRangeLabel(from: string, to: string): string {
  if (from === to) return formatDate(from);
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  if (fy === ty && fm === tm && fd === 1) {
    return formatMonth(from.slice(0, 7));
  }
  return `${formatDate(from)} – ${formatDate(to)}`;
}

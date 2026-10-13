import { useEffect, useRef, useState } from "react";
import { DayPicker, type DateRange as DayRange } from "react-day-picker";
import { es } from "react-day-picker/locale";
import "react-day-picker/style.css";
import {
  formatRangeLabel,
  isoDay,
  parseIsoDay,
  type DateRange,
} from "../lib/dates";

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="5" width="17" height="16" rx="3" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </svg>
  );
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function monthOffset(date: Date, offset: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function buildPresets(now: Date): { label: string; range: DateRange }[] {
  return [
    { label: "Este mes", range: monthRange(now, 0) },
    { label: "Mes anterior", range: monthRange(now, -1) },
    {
      label: "Últimos 3 meses",
      range: {
        from: isoDay(startOfMonth(monthOffset(now, -2))),
        to: isoDay(now),
      },
    },
    {
      label: "Este año",
      range: {
        from: isoDay(new Date(now.getFullYear(), 0, 1)),
        to: isoDay(now),
      },
    },
  ];
}

function monthRange(now: Date, offset: number): DateRange {
  const month = monthOffset(now, offset);
  const fullEnd = endOfMonth(month);
  const end = offset === 0 && now < fullEnd ? now : fullEnd;
  return { from: isoDay(startOfMonth(month)), to: isoDay(end) };
}

export function DateRangePicker({
  value,
  onChange,
  presets = false,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
  presets?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DayRange | undefined>();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const now = new Date();

  useEffect(() => {
    if (open) {
      setDraft({ from: parseIsoDay(value.from), to: parseIsoDay(value.to) });
    }
  }, [open, value.from, value.to]);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      popoverRef.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const popover = popoverRef.current;
      if (!popover) return;
      const focusables = Array.from(
        popover.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function commit(range: DayRange | undefined) {
    setDraft(range);
    if (!range?.from || !range.to) return;
    const first = isoDay(range.from);
    const last = isoDay(range.to);
    onChange(first <= last ? { from: first, to: last } : { from: last, to: first });
    setOpen(false);
  }

  function applyPreset(range: DateRange) {
    onChange(range);
    setOpen(false);
  }

  return (
    <div className="range-picker" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={open ? "range-trigger open" : "range-trigger"}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarIcon />
        <span className="range-trigger-value">
          {formatRangeLabel(value.from, value.to)}
        </span>
        <span className="range-trigger-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div
          className="range-popover"
          role="dialog"
          aria-label="Selecciona un periodo"
          ref={popoverRef}
          tabIndex={-1}
        >
          {presets && (
            <div className="range-presets">
              {buildPresets(now).map((preset) => {
                const active =
                  preset.range.from === value.from && preset.range.to === value.to;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    className={active ? "range-preset active" : "range-preset"}
                    aria-pressed={active}
                    onClick={() => applyPreset(preset.range)}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          )}
          <DayPicker
            mode="range"
            locale={es}
            weekStartsOn={1}
            numberOfMonths={2}
            showOutsideDays
            defaultMonth={parseIsoDay(value.from)}
            selected={draft}
            onSelect={commit}
          />
          <p className="range-hint small muted">
            Pulsa el primer día y luego el último. Vuelve a pulsar para empezar de nuevo.
          </p>
        </div>
      )}
    </div>
  );
}

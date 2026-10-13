import { describe, expect, it } from "vitest";
import {
  DEFAULT_SECTION_ORDER,
  deltaClass,
  formatDelta,
  isRange,
  monthRange,
  normalizeSectionOrder,
  shiftMonth,
  singleMonthOf,
} from "./view";

describe("monthRange", () => {
  it("devuelve el primer y último día de un mes pasado", () => {
    expect(monthRange("2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(monthRange("2025-02")).toEqual({ from: "2025-02-01", to: "2025-02-28" });
  });
});

describe("shiftMonth", () => {
  it("avanza y retrocede meses cruzando el año", () => {
    expect(shiftMonth({ from: "2024-12-01", to: "2024-12-31" }, 1)).toEqual({
      from: "2025-01-01",
      to: "2025-01-31",
    });
    expect(shiftMonth({ from: "2024-01-01", to: "2024-01-31" }, -1)).toEqual({
      from: "2023-12-01",
      to: "2023-12-31",
    });
  });
});

describe("singleMonthOf", () => {
  it("devuelve el mes si el rango empieza el día 1 y no cruza de mes", () => {
    expect(singleMonthOf({ from: "2024-02-01", to: "2024-02-29" })).toBe("2024-02");
    expect(singleMonthOf({ from: "2024-02-01", to: "2024-02-15" })).toBe("2024-02");
  });

  it("devuelve null si no empieza el día 1 o cruza de mes", () => {
    expect(singleMonthOf({ from: "2024-02-02", to: "2024-02-29" })).toBeNull();
    expect(singleMonthOf({ from: "2024-02-01", to: "2024-03-31" })).toBeNull();
  });
});

describe("isRange", () => {
  it("valida objetos con from y to de tipo string", () => {
    expect(isRange({ from: "2024-01-01", to: "2024-01-31" })).toBe(true);
    expect(isRange({ from: "2024-01-01" })).toBe(false);
    expect(isRange({ from: 1, to: 2 })).toBe(false);
    expect(isRange(null)).toBe(false);
    expect(isRange("2024-01-01")).toBe(false);
  });
});

describe("normalizeSectionOrder", () => {
  it("acepta una permutación válida de las secciones", () => {
    const reversed = [...DEFAULT_SECTION_ORDER].reverse();
    expect(normalizeSectionOrder(reversed)).toEqual(reversed);
  });

  it("rechaza valores inválidos", () => {
    expect(normalizeSectionOrder(null)).toBeNull();
    expect(normalizeSectionOrder("history")).toBeNull();
    expect(normalizeSectionOrder(["history", "clients"])).toBeNull();
    expect(normalizeSectionOrder(["history", "clients", "import", "history"])).toBeNull();
  });
});

describe("formatDelta", () => {
  it("redondea y añade signo", () => {
    expect(formatDelta(0.4)).toBe("0 %");
    expect(formatDelta(12.6)).toBe("+13 %");
    expect(formatDelta(-12.6)).toBe("-13 %");
  });
});

describe("deltaClass", () => {
  it("devuelve la clase según el signo", () => {
    expect(deltaClass(0)).toBe("delta flat");
    expect(deltaClass(5)).toBe("delta up");
    expect(deltaClass(-5)).toBe("delta down");
  });
});

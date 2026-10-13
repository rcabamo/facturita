import { describe, expect, it } from "vitest";
import {
  firstDayOfMonth,
  formatMonth,
  formatRangeLabel,
  isoDay,
  lastDayOfMonth,
  parseIsoDay,
} from "./dates";

describe("isoDay / parseIsoDay", () => {
  it("convierte en ambos sentidos", () => {
    expect(isoDay(new Date(2024, 1, 29))).toBe("2024-02-29");
    expect(parseIsoDay("2024-02-29")).toEqual(new Date(2024, 1, 29));
  });
});

describe("firstDayOfMonth / lastDayOfMonth", () => {
  it("tiene en cuenta los años bisiestos", () => {
    expect(firstDayOfMonth(2024, 1)).toBe("2024-02-01");
    expect(lastDayOfMonth(2024, 1)).toBe("2024-02-29");
    expect(lastDayOfMonth(2025, 1)).toBe("2025-02-28");
    expect(lastDayOfMonth(2024, 11)).toBe("2024-12-31");
  });
});

describe("formatMonth", () => {
  it("devuelve mes abreviado y año con la inicial en mayúscula", () => {
    expect(formatMonth("2024-02")).toBe("Feb 2024");
  });
});

describe("formatRangeLabel", () => {
  it("usa el nombre del mes cuando el rango es un mes completo", () => {
    expect(formatRangeLabel("2024-02-01", "2024-02-29")).toBe("Feb 2024");
  });
});

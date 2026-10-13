import { describe, expect, it } from "vitest";
import { formatMoney, formatNumber } from "./format";

describe("formatMoney", () => {
  it("usa dos decimales y el símbolo de la moneda", () => {
    expect(formatMoney(999.5, "€")).toBe("€999,50");
  });
});

describe("formatNumber", () => {
  it("usa la coma como separador decimal", () => {
    expect(formatNumber(999.5)).toBe("999,5");
  });
});

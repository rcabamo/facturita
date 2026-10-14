import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MonthlyIncome } from "../lib/api";
import { MonthlyChart } from "./MonthlyChart";

const data: MonthlyIncome[] = [
  { month: "2024-01", classes: 4, amount: 120 },
  { month: "2024-02", classes: 6, amount: 180 },
];

describe("MonthlyChart", () => {
  it("no renderiza nada sin datos", () => {
    const { container } = render(<MonthlyChart data={[]} currency="€" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("dibuja el gráfico con una etiqueta accesible", () => {
    render(<MonthlyChart data={data} currency="€" />);
    expect(screen.getByRole("img", { name: "Clases por mes" })).toBeInTheDocument();
  });

  it("pinta un punto por mes", () => {
    const { container } = render(<MonthlyChart data={data} currency="€" />);
    expect(container.querySelectorAll(".chart-dot")).toHaveLength(data.length);
  });
});

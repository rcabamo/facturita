import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassDetailTable } from "./ClassDetailTable";

const money = (value: number) => `${value} €`;

describe("ClassDetailTable", () => {
  it("muestra un mensaje cuando no hay filas", () => {
    render(<ClassDetailTable rows={[]} money={money} />);
    expect(screen.getByText("Sin clases registradas.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renderiza las filas con tarifa, importe y duración", () => {
    render(
      <ClassDetailTable
        money={money}
        rows={[
          {
            id: "1",
            summary: "Clase de inglés",
            start_ts: "2024-03-05T10:00:00Z",
            duration_min: 60,
            rate: 30,
            amount: 30,
          },
          {
            id: "2",
            summary: null,
            start_ts: "2024-03-06T10:00:00Z",
            duration_min: null,
            rate: 30,
            amount: 30,
          },
        ]}
      />,
    );

    expect(screen.getByText("Clase de inglés")).toBeInTheDocument();
    expect(screen.getByText("(sin título)")).toBeInTheDocument();
    expect(screen.getByText("60 min")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getAllByText("30 €")).toHaveLength(4);
  });

  it("permite fijar un mensaje vacío personalizado", () => {
    render(<ClassDetailTable rows={[]} money={money} emptyMessage="Nada por aquí." />);
    expect(screen.getByText("Nada por aquí.")).toBeInTheDocument();
  });
});

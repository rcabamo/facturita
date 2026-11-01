import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClassDetailTable } from "./ClassDetailTable";

const money = (value: number) => `${value} €`;

describe("ClassDetailTable", () => {
  it("muestra un mensaje cuando no hay filas", () => {
    render(<ClassDetailTable rows={[]} money={money} />);
    expect(screen.getByText("Sin clases registradas.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renderiza las filas con tarifa e importe", () => {
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
    expect(screen.getAllByText("30 €")).toHaveLength(4);
  });

  it("permite fijar un mensaje vacío personalizado", () => {
    render(<ClassDetailTable rows={[]} money={money} emptyMessage="Nada por aquí." />);
    expect(screen.getByText("Nada por aquí.")).toBeInTheDocument();
  });

  it("permite editar la tarifa/hora de una clase y volver a la tarifa automática", async () => {
    const user = userEvent.setup();
    const onChangeRate = vi.fn();
    render(
      <ClassDetailTable
        money={money}
        symbol="€"
        onChangeRate={onChangeRate}
        rows={[
          {
            id: "1",
            summary: "Clase de inglés",
            start_ts: "2024-03-05T10:00:00Z",
            duration_min: 60,
            rate: 30,
            amount: 30,
            email: "ana@x",
            overridden: true,
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /30/ }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "35");
    await user.tab();
    expect(onChangeRate).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }), 35);

    await user.click(screen.getByRole("button", { name: "Volver a la tarifa automática" }));
    expect(onChangeRate).toHaveBeenLastCalledWith(expect.objectContaining({ id: "1" }), null);
  });

  it("no permite editar la tarifa de una clase ya facturada", () => {
    const onChangeRate = vi.fn();
    render(
      <ClassDetailTable
        money={money}
        symbol="€"
        onChangeRate={onChangeRate}
        rows={[
          {
            id: "1",
            summary: "Clase de inglés",
            start_ts: "2024-03-05T10:00:00Z",
            duration_min: 60,
            rate: 30,
            amount: 30,
            email: "ana@x",
            invoiceNumber: "2026-0003",
          },
        ]}
      />,
    );

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByTitle(/2026-0003/)).toBeInTheDocument();
  });

  it("permite quitar de la factura las filas con evento", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <ClassDetailTable
        money={money}
        onRemove={onRemove}
        rows={[
          {
            id: "e1",
            summary: "Clase de inglés",
            start_ts: "2024-03-05T10:00:00Z",
            duration_min: 60,
            rate: 30,
            amount: 30,
            eventId: "e1",
          },
          {
            id: "2024-03-07-Clase-30",
            summary: "Clase antigua",
            start_ts: "2024-03-07T10:00:00Z",
            duration_min: 60,
            rate: 30,
            amount: 30,
            eventId: null,
          },
        ]}
      />,
    );

    const buttons = screen.getAllByRole("button", { name: "Quitar" });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]);
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ eventId: "e1" }));
  });
});

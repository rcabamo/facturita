import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Section } from "../lib/view";
import { OnboardingTour } from "./OnboardingTour";

const SECTIONS: Section[] = ["import", "history", "clients", "billing", "settings"];

function renderTour(open = true) {
  const onNavigate = vi.fn();
  const onFinish = vi.fn();
  render(
    <>
      {SECTIONS.map((section) => (
        <button key={section} type="button" data-section={section}>
          {section}
        </button>
      ))}
      <OnboardingTour open={open} onNavigate={onNavigate} onFinish={onFinish} />
    </>,
  );
  return { onNavigate, onFinish };
}

describe("OnboardingTour", () => {
  it("no renderiza nada cuando está cerrado", () => {
    renderTour(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("arranca en la bienvenida y avanza a cada sección", async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderTour();

    expect(screen.getByRole("heading", { name: "Bienvenida a Facturita" })).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("heading", { name: "Importación" })).toBeInTheDocument();
    expect(onNavigate).toHaveBeenCalledWith("import");

    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("heading", { name: "Histórico" })).toBeInTheDocument();
    expect(onNavigate).toHaveBeenLastCalledWith("history");
  });

  it("permite retroceder con Anterior", async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderTour();

    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await user.click(screen.getByRole("button", { name: "Anterior" }));

    expect(screen.getByRole("heading", { name: "Importación" })).toBeInTheDocument();
    expect(onNavigate).toHaveBeenLastCalledWith("import");
  });

  it("deshabilita Anterior en el primer paso", () => {
    renderTour();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
  });

  it("salta la guía al pulsar Saltar", async () => {
    const user = userEvent.setup();
    const { onFinish } = renderTour();
    await user.click(screen.getByRole("button", { name: "Saltar" }));
    expect(onFinish).toHaveBeenCalled();
  });

  it("finaliza en el último paso y llama a onFinish", async () => {
    const user = userEvent.setup();
    const { onFinish } = renderTour();
    for (let i = 0; i < 6; i += 1) {
      await user.click(screen.getByRole("button", { name: "Siguiente" }));
    }
    expect(screen.getByRole("heading", { name: "¡Todo listo!" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Empezar" }));
    expect(onFinish).toHaveBeenCalled();
  });

  it("navega con las flechas del teclado", async () => {
    const user = userEvent.setup();
    renderTour();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("heading", { name: "Importación" })).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("heading", { name: "Bienvenida a Facturita" })).toBeInTheDocument();
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api", async () => ({ api: (await import("../test/mocks")).createApiMock() }));

import { api } from "../lib/api";
import { RateHistoryEditor } from "./RateHistoryEditor";

const mocked = vi.mocked(api);

beforeEach(() => {
  vi.clearAllMocks();
  mocked.clientRateHistory.mockResolvedValue([{ effective_from: "2024-01", rate: 40 }]);
  mocked.setClientRate.mockResolvedValue(undefined);
  mocked.deleteClientRate.mockResolvedValue(undefined);
});

describe("RateHistoryEditor", () => {
  it("carga y muestra las tarifas del cliente", async () => {
    render(<RateHistoryEditor email="ana@x" currency="€" defaultRate={30} onChanged={vi.fn()} />);
    expect(await screen.findByDisplayValue("40")).toBeInTheDocument();
    expect(mocked.clientRateHistory).toHaveBeenCalledWith("ana@x");
  });

  it("avisa cuando el cliente no tiene tarifas propias", async () => {
    mocked.clientRateHistory.mockResolvedValue([]);
    render(<RateHistoryEditor email="ana@x" currency="€" defaultRate={30} onChanged={vi.fn()} />);
    expect(
      await screen.findByText("Sin tarifas propias: se usa la tarifa normal."),
    ).toBeInTheDocument();
  });

  it("elimina una tarifa y recarga", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(<RateHistoryEditor email="ana@x" currency="€" defaultRate={30} onChanged={onChanged} />);
    await screen.findByDisplayValue("40");

    await user.click(screen.getByRole("button", { name: "Quitar" }));
    await waitFor(() => expect(mocked.deleteClientRate).toHaveBeenCalledWith("ana@x", "2024-01"));
    expect(onChanged).toHaveBeenCalled();
  });

  it("añade la tarifa del mes en curso", async () => {
    const user = userEvent.setup();
    mocked.clientRateHistory
      .mockResolvedValueOnce([{ effective_from: "2024-01", rate: 40 }])
      .mockResolvedValue([]);
    render(<RateHistoryEditor email="ana@x" currency="€" defaultRate={30} onChanged={vi.fn()} />);
    await screen.findByDisplayValue("40");

    await user.click(screen.getByRole("button", { name: "Añadir tarifa" }));
    await waitFor(() =>
      expect(mocked.setClientRate).toHaveBeenCalledWith("ana@x", 40, expect.any(String)),
    );
  });
});

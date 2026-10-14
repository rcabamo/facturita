import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SortableTh } from "./SortableTh";

describe("SortableTh", () => {
  it("expone aria-sort según el estado activo", () => {
    const { rerender } = render(
      <table>
        <thead>
          <tr>
            <SortableTh
              label="Importe"
              sortKey="amount"
              sort={{ key: "amount", dir: "desc" }}
              onSort={vi.fn()}
            />
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "descending");

    rerender(
      <table>
        <thead>
          <tr>
            <SortableTh
              label="Importe"
              sortKey="amount"
              sort={{ key: "amount", dir: "asc" }}
              onSort={vi.fn()}
            />
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "ascending");
  });

  it("marca como none las columnas no activas y notifica el clic", async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(
      <table>
        <thead>
          <tr>
            <SortableTh
              label="Importe"
              sortKey="amount"
              sort={{ key: "name", dir: "asc" }}
              onSort={onSort}
            />
          </tr>
        </thead>
      </table>,
    );

    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "none");
    await user.click(screen.getByRole("button", { name: /Importe/ }));
    expect(onSort).toHaveBeenCalledWith("amount");
  });
});

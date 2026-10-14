import { describe, expect, it } from "vitest";
import type { ClientIncome } from "./api";
import { nextSort, sortClients } from "./sorting";

const clients: ClientIncome[] = [
  { email: "ana@example.com", name: "Ana", classes: 3, amount: 90, rate: null },
  {
    email: "bruno@example.com",
    name: "Bruno",
    classes: 10,
    amount: 300,
    rate: 30,
  },
  { email: "carla@example.com", name: "Carla", classes: 1, amount: 30, rate: null },
];

describe("sortClients", () => {
  it("ordena por nombre ascendente", () => {
    const result = sortClients(clients, { key: "name", dir: "asc" }, "");
    expect(result.map((c) => c.name)).toEqual(["Ana", "Bruno", "Carla"]);
  });

  it("ordena por importe descendente", () => {
    const result = sortClients(clients, { key: "amount", dir: "desc" }, "");
    expect(result.map((c) => c.name)).toEqual(["Bruno", "Ana", "Carla"]);
  });

  it("filtra por nombre o email", () => {
    expect(sortClients(clients, { key: "name", dir: "asc" }, "bru").map((c) => c.name)).toEqual([
      "Bruno",
    ]);
    expect(sortClients(clients, { key: "name", dir: "asc" }, "carla@").map((c) => c.name)).toEqual([
      "Carla",
    ]);
  });

  it("no muta la lista original", () => {
    const copy = [...clients];
    sortClients(clients, { key: "amount", dir: "desc" }, "");
    expect(clients).toEqual(copy);
  });
});

describe("nextSort", () => {
  it("alterna la dirección cuando se repite la clave", () => {
    expect(nextSort({ key: "amount", dir: "desc" }, "amount")).toEqual({
      key: "amount",
      dir: "asc",
    });
  });

  it("usa ascendente para nombre y email y descendente para el resto", () => {
    expect(nextSort({ key: "amount", dir: "desc" }, "name")).toEqual({ key: "name", dir: "asc" });
    expect(nextSort({ key: "name", dir: "asc" }, "email")).toEqual({ key: "email", dir: "asc" });
    expect(nextSort({ key: "name", dir: "asc" }, "classes")).toEqual({
      key: "classes",
      dir: "desc",
    });
  });
});

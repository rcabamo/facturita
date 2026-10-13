import type { ClientIncome } from "./api";

export type SortKey = "name" | "email" | "classes" | "minutes" | "amount";

export interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

export function sortClients(list: ClientIncome[], sort: SortState, query: string): ClientIncome[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? list.filter(
        (client) => client.name.toLowerCase().includes(q) || client.email.toLowerCase().includes(q),
      )
    : list;
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...filtered].sort((a, b) => {
    const ka = a[sort.key];
    const kb = b[sort.key];
    if (typeof ka === "string" && typeof kb === "string") {
      return ka.localeCompare(kb, "es") * dir;
    }
    return ((ka as number) - (kb as number)) * dir;
  });
}

export function nextSort(current: SortState, key: SortKey): SortState {
  if (current.key === key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: key === "name" || key === "email" ? "asc" : "desc" };
}

import { type Mock, vi } from "vitest";
import type { api } from "../lib/api";

type Api = typeof api;

export type ApiMock = { [K in keyof Api]: Mock };

const METHODS: (keyof Api)[] = [
  "getStatus",
  "getGoogleCredentials",
  "setGoogleCredentials",
  "connectGoogle",
  "disconnectGoogle",
  "listCalendars",
  "setSelectedCalendars",
  "syncEvents",
  "classDetail",
  "exportCsv",
  "getRatesConfig",
  "setRatesConfig",
  "setClientRate",
  "updateClientRate",
  "deleteClientRate",
  "clientRateHistory",
  "incomeByClient",
  "incomeByMonth",
  "listClasses",
  "acceptImport",
  "setEventReview",
  "setEventsReview",
  "pendingCount",
  "setClientName",
  "getSettingValue",
  "setSettingValue",
  "latestEventMonth",
  "exportBackup",
  "importBackup",
  "getInvoiceSettings",
  "setInvoiceSettings",
  "previewInvoice",
  "issueInvoice",
  "listInvoices",
  "exportSavedInvoice",
];

/**
 * Crea un mock del módulo `src/lib/api` con todos sus comandos como `vi.fn()`.
 * Se importa perezosamente dentro de `vi.mock` para evitar el hoisting:
 *
 *   vi.mock("../lib/api", async () => ({ api: (await import("../test/mocks")).createApiMock() }));
 */
export function createApiMock(): ApiMock {
  const mock = {} as ApiMock;
  for (const key of METHODS) {
    mock[key] = vi.fn();
  }
  return mock;
}

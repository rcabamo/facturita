import { useCallback, useEffect, useState } from "react";
import { api, type ClassDetail } from "./api";
import { ALL_FROM, ALL_TO } from "./view";

export function useClientsPanel({
  from,
  to,
  loadData,
  setError,
  withPending,
  pushToast,
}: {
  from: string;
  to: string;
  loadData: (options?: { silent?: boolean }) => Promise<void>;
  setError: (message: string | null) => void;
  withPending: (key: string, action: () => Promise<void>) => Promise<void>;
  pushToast: (kind: "success" | "error" | "info", message: string) => void;
}) {
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [clientClasses, setClientClasses] = useState<ClassDetail[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClassDetail[]>([]);

  const reloadClientClasses = useCallback(
    (email: string) =>
      api
        .classDetail(ALL_FROM, ALL_TO, email)
        .then(setClientClasses)
        .catch((err) => setError(String(err))),
    [setError],
  );

  useEffect(() => {
    if (!selectedClient) {
      setClientClasses([]);
      return;
    }
    void reloadClientClasses(selectedClient);
  }, [selectedClient, reloadClientClasses]);

  useEffect(() => {
    if (!expanded) {
      setDetail([]);
      return;
    }
    api
      .classDetail(from, to, expanded)
      .then(setDetail)
      .catch((err) => setError(String(err)));
  }, [expanded, from, to, setError]);

  function toggleClient(email: string) {
    setSelectedClient((current) => (current === email ? null : email));
  }

  function toggleExpanded(email: string) {
    setExpanded((current) => (current === email ? null : email));
  }

  function changeClientName(email: string, name: string | null) {
    return withPending(`name:${email}`, async () => {
      try {
        await api.setClientName(email, name?.trim() ? name.trim() : null);
        await loadData();
        pushToast("success", "Nombre actualizado.");
      } catch (err) {
        setError(String(err));
      }
    });
  }

  return {
    selectedClient,
    setSelectedClient,
    toggleClient,
    clientClasses,
    reloadClientClasses,
    expanded,
    setExpanded,
    toggleExpanded,
    detail,
    changeClientName,
  };
}

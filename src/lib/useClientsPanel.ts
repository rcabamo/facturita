import { useCallback, useEffect, useState } from "react";
import { api, type ClassDetail, type ClientAlias } from "./api";
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
  const [clientClassesLoading, setClientClassesLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClassDetail[]>([]);
  const [aliases, setAliases] = useState<ClientAlias[]>([]);

  const reloadAliases = useCallback(
    () =>
      api
        .listClientAliases()
        .then(setAliases)
        .catch((err) => setError(String(err))),
    [setError],
  );

  useEffect(() => {
    void reloadAliases();
  }, [reloadAliases]);

  const reloadClientClasses = useCallback(
    async (email: string) => {
      setClientClassesLoading(true);
      try {
        setClientClasses(await api.classDetail(ALL_FROM, ALL_TO, email));
      } catch (err) {
        setError(String(err));
      } finally {
        setClientClassesLoading(false);
      }
    },
    [setError],
  );

  useEffect(() => {
    if (!selectedClient) {
      setClientClasses([]);
      setClientClassesLoading(false);
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
    // En el panel maestro-detalle, pulsar un cliente siempre abre su ficha.
    setSelectedClient(email);
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

  function changeClassRate(row: { id: string; email?: string }, rate: number | null) {
    const { id, email } = row;
    if (!email) return Promise.resolve();
    return withPending(`rate:${id}:${email}`, async () => {
      try {
        await api.setEventClientRate(id, email, rate);
        await loadData({ silent: true });
        if (selectedClient) await reloadClientClasses(selectedClient);
        if (expanded) setDetail(await api.classDetail(from, to, expanded));
        pushToast(
          "success",
          rate == null ? "Tarifa automática restaurada." : "Tarifa de la clase actualizada.",
        );
      } catch (err) {
        setError(String(err));
      }
    });
  }

  function linkAlias(email: string, clientEmail: string) {
    return withPending(`alias:${email}`, async () => {
      try {
        await api.linkClientAlias(email, clientEmail);
        await Promise.all([reloadAliases(), loadData({ silent: true })]);
        if (selectedClient) await reloadClientClasses(selectedClient);
        if (expanded) setDetail(await api.classDetail(from, to, expanded));
        pushToast("success", "Email vinculado al cliente.");
      } catch (err) {
        setError(String(err));
      }
    });
  }

  function unlinkAlias(email: string) {
    return withPending(`alias:${email}`, async () => {
      try {
        await api.unlinkClientAlias(email);
        await Promise.all([reloadAliases(), loadData({ silent: true })]);
        pushToast("success", "Email separado del cliente.");
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
    clientClassesLoading,
    reloadClientClasses,
    expanded,
    setExpanded,
    toggleExpanded,
    detail,
    changeClientName,
    changeClassRate,
    aliases,
    reloadAliases,
    linkAlias,
    unlinkAlias,
  };
}

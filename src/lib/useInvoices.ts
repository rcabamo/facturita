import { useCallback, useEffect, useState } from "react";
import { api, type InvoiceRecord, type InvoiceSettings } from "./api";

const EMPTY_SETTINGS: InvoiceSettings = {
  name: "",
  tax_id: "",
  address: "",
  email: "",
  phone: "",
};

export function useInvoices({
  setError,
  pushToast,
}: {
  setError: (message: string | null) => void;
  pushToast: (kind: "success" | "error" | "info", message: string) => void;
}) {
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>(EMPTY_SETTINGS);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [savingIssuer, setSavingIssuer] = useState(false);
  const [exportingInvoiceId, setExportingInvoiceId] = useState<number | null>(null);
  const [invoiceEmail, setInvoiceEmail] = useState<string | null>(null);

  const reloadInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      setInvoices(await api.listInvoices());
    } catch (err) {
      setError(String(err));
    } finally {
      setInvoicesLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    api
      .getInvoiceSettings()
      .then(setInvoiceSettings)
      .catch(() => undefined);
    void reloadInvoices();
  }, [reloadInvoices]);

  async function saveIssuerSettings(settings: InvoiceSettings) {
    setSavingIssuer(true);
    try {
      await api.setInvoiceSettings(settings);
      setInvoiceSettings(settings);
      pushToast("success", "Datos de facturación guardados.");
    } catch (err) {
      setError(String(err));
      throw err;
    } finally {
      setSavingIssuer(false);
    }
  }

  async function exportInvoice(id: number) {
    setExportingInvoiceId(id);
    try {
      const path = await api.exportSavedInvoice(id);
      if (path) pushToast("success", `Factura guardada en ${path}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setExportingInvoiceId(null);
    }
  }

  return {
    invoiceSettings,
    invoices,
    invoicesLoading,
    savingIssuer,
    exportingInvoiceId,
    invoiceEmail,
    setInvoiceEmail,
    reloadInvoices,
    saveIssuerSettings,
    exportInvoice,
  };
}

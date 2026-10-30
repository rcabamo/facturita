import { useEffect, useState } from "react";
import { api, type ClientBilling } from "../lib/api";

const EMPTY_BILLING: ClientBilling = {
  legal_name: "",
  tax_id: "",
  address: "",
};

export function ClientBillingEditor({
  email,
  notify,
}: {
  email: string;
  notify?: (kind: "success" | "error" | "info", message: string) => void;
}) {
  const [billing, setBilling] = useState<ClientBilling>(EMPTY_BILLING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getClientBilling(email)
      .then((value) => {
        if (!cancelled) setBilling(value);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [email]);

  function change(key: keyof ClientBilling, value: string) {
    setBilling((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.setClientBilling(email, billing);
      notify?.("success", "Datos fiscales del cliente guardados.");
    } catch (err) {
      setError(String(err));
      notify?.("error", String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="muted small">Cargando datos fiscales…</p>;
  }

  return (
    <>
      {error && <div className="alert error">{error}</div>}
      <form className="issuer-form client-billing-form" onSubmit={save}>
        <label>
          Nombre fiscal / razón social
          <input
            value={billing.legal_name}
            placeholder="Igual que el nombre del cliente"
            onChange={(event) => change("legal_name", event.target.value)}
          />
        </label>
        <label>
          NIF
          <input
            value={billing.tax_id}
            placeholder="12345678A"
            onChange={(event) => change("tax_id", event.target.value)}
          />
        </label>
        <label>
          Dirección
          <input
            value={billing.address}
            placeholder="Calle, número, CP, ciudad"
            onChange={(event) => change("address", event.target.value)}
          />
        </label>
        <button type="submit" disabled={saving}>
          {saving ? "Guardando…" : "Guardar datos fiscales"}
        </button>
      </form>
      <p className="muted small">
        Se usan en las facturas de este cliente. Si dejas el nombre fiscal vacío se usará el nombre
        del cliente.
      </p>
    </>
  );
}

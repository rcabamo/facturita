import { useEffect, useState } from "react";
import type { InvoiceSettings } from "../lib/api";

export function IssuerForm({
  value,
  saving,
  submitLabel = "Guardar",
  onSubmit,
}: {
  value: InvoiceSettings;
  saving?: boolean;
  submitLabel?: string;
  onSubmit: (settings: InvoiceSettings) => void;
}) {
  const [form, setForm] = useState<InvoiceSettings>(value);

  useEffect(() => {
    setForm(value);
  }, [value]);

  function field(key: keyof InvoiceSettings) {
    return {
      value: form[key],
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        setForm((current) => ({ ...current, [key]: event.target.value })),
    };
  }

  return (
    <form
      className="issuer-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
    >
      <label>
        Nombre o razón social
        <input {...field("name")} placeholder="Nombre y apellidos" required />
      </label>
      <label>
        NIF
        <input {...field("tax_id")} placeholder="12345678A" required />
      </label>
      <label>
        Dirección
        <input {...field("address")} placeholder="Calle, número, CP, ciudad" />
      </label>
      <label>
        Email
        <input {...field("email")} type="email" placeholder="correo@ejemplo.com" />
      </label>
      <label>
        Teléfono
        <input {...field("phone")} placeholder="600 000 000" />
      </label>
      <button type="submit" disabled={saving}>
        {saving ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}

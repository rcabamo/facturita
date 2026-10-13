import type { RatesConfig } from "../../lib/api";
import { InlineNumberValue, InlineTextValue } from "../InlineValue";
import { DownloadIcon, UploadIcon } from "../icons";

export function SettingsSection({
  rates,
  pending,
  onPersistRates,
  onExportBackup,
  onImportBackup,
}: {
  rates: RatesConfig;
  pending: boolean;
  onPersistRates: (
    patch: Partial<Pick<RatesConfig, "default_rate" | "shared_rate" | "currency">>,
  ) => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
}) {
  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Tarifas</h2>
          {pending && <span className="muted small">Guardando…</span>}
        </div>
        <div className="settings-form">
          <div className="field">
            {/* biome-ignore lint/a11y/noLabelWithoutControl: etiqueta para un campo editable personalizado */}
            <label>Tarifa normal (1 persona)</label>
            <InlineNumberValue
              value={rates.default_rate}
              symbol={rates.currency}
              disabled={pending}
              onCommit={(value) => onPersistRates({ default_rate: value })}
            />
          </div>
          <div className="field">
            {/* biome-ignore lint/a11y/noLabelWithoutControl: etiqueta para un campo editable personalizado */}
            <label>Tarifa compartida (por alumno)</label>
            <InlineNumberValue
              value={rates.shared_rate}
              symbol={rates.currency}
              disabled={pending}
              onCommit={(value) => onPersistRates({ shared_rate: value })}
            />
          </div>
          <div className="field">
            {/* biome-ignore lint/a11y/noLabelWithoutControl: etiqueta para un campo editable personalizado */}
            <label>Símbolo</label>
            <InlineTextValue
              value={rates.currency}
              placeholder="€"
              disabled={pending}
              onCommit={(value) => onPersistRates({ currency: value })}
            />
          </div>
          <p className="muted small settings-note">
            El cobro es siempre por clase. Las clases con más de un invitado usan la tarifa
            compartida (por alumno). La tarifa individual de cada cliente se edita al desplegarlo en
            la sección Clientes.
          </p>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Copia de seguridad</h2>
          <div className="head-actions">
            <button
              type="button"
              className="ghost with-icon"
              onClick={onExportBackup}
              disabled={pending}
            >
              <DownloadIcon size={16} />
              Exportar todo
            </button>
            <button
              type="button"
              className="ghost with-icon"
              onClick={onImportBackup}
              disabled={pending}
            >
              <UploadIcon size={16} />
              Importar…
            </button>
          </div>
        </div>
        <p className="muted small">
          Exporta todos los datos (clases, clientes, tarifas y ajustes) a un archivo JSON, o
          restaura una copia anterior. La importación reemplaza los datos actuales.
        </p>
      </section>
    </>
  );
}

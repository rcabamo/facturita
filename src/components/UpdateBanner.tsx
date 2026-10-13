import type { Updater } from "../lib/useUpdater";

export function UpdateBanner({ updater }: { updater: Updater }) {
  const { update, installing, progress, error, dismissed, dismiss, install } = updater;

  if (!update || dismissed) {
    return null;
  }

  return (
    <div className="update-banner">
      <span>
        Nueva versión <strong>{update.version}</strong> disponible.
      </span>
      {error && <span className="update-error">{error}</span>}
      {installing ? (
        <span className="muted small">
          {progress != null ? `Descargando… ${progress}%` : "Descargando…"}
        </span>
      ) : (
        <div className="update-actions">
          <button onClick={install}>Actualizar</button>
          <button className="ghost" onClick={dismiss}>
            Ahora no
          </button>
        </div>
      )}
    </div>
  );
}

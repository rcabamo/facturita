import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    check()
      .then((available) => {
        if (available) setUpdate(available);
      })
      .catch(() => undefined);
  }, []);

  if (!update || dismissed) {
    return null;
  }

  async function install() {
    if (!update) return;
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      let total = 0;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setProgress(total ? Math.round((downloaded / total) * 100) : null);
        } else if (event.event === "Finished") {
          setProgress(100);
        }
      });
      await relaunch();
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  return (
    <div className="update-banner">
      <span>
        Nueva versión <strong>{update.version}</strong> disponible.
      </span>
      {error && <span className="update-error">{error}</span>}
      {busy ? (
        <span className="muted small">
          {progress != null ? `Descargando… ${progress}%` : "Descargando…"}
        </span>
      ) : (
        <div className="update-actions">
          <button onClick={install}>Actualizar</button>
          <button className="ghost" onClick={() => setDismissed(true)}>
            Ahora no
          </button>
        </div>
      )}
    </div>
  );
}

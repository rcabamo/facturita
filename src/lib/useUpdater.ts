import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useState } from "react";

export interface Updater {
  update: Update | null;
  checking: boolean;
  installing: boolean;
  progress: number | null;
  error: string | null;
  dismissed: boolean;
  dismiss: () => void;
  checkNow: () => Promise<{ update: Update | null; error: string | null }>;
  install: () => Promise<void>;
}

export function useUpdater(): Updater {
  const [update, setUpdate] = useState<Update | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const checkNow = useCallback(async (): Promise<{
    update: Update | null;
    error: string | null;
  }> => {
    setChecking(true);
    setError(null);
    try {
      const available = await check();
      setUpdate(available);
      if (available) setDismissed(false);
      return { update: available, error: null };
    } catch (err) {
      const message = String(err);
      setError(message);
      return { update: null, error: message };
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkNow();
  }, [checkNow]);

  const install = useCallback(async () => {
    if (!update) return;
    setInstalling(true);
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
      setInstalling(false);
    }
  }, [update]);

  return {
    update,
    checking,
    installing,
    progress,
    error,
    dismissed,
    dismiss: () => setDismissed(true),
    checkNow,
    install,
  };
}

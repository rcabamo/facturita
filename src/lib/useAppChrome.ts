import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "./useTheme";
import { useUpdater } from "./useUpdater";

export function useAppChrome() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, changeTheme } = useTheme();
  const updater = useUpdater();
  const [appVersion, setAppVersion] = useState("");
  const [needsReauth, setNeedsReauth] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointer(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    function handleReauth() {
      setNeedsReauth(true);
    }
    window.addEventListener("facturita:reauth", handleReauth);
    return () => window.removeEventListener("facturita:reauth", handleReauth);
  }, []);

  return {
    menuOpen,
    setMenuOpen,
    menuRef,
    theme,
    changeTheme,
    updater,
    appVersion,
    needsReauth,
    setNeedsReauth,
  };
}

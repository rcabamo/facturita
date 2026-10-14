import { getVersion } from "@tauri-apps/api/app";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useTheme } from "./useTheme";
import { useUpdater } from "./useUpdater";

export function useAppChrome() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, changeTheme } = useTheme();
  const updater = useUpdater();
  const [appVersion, setAppVersion] = useState("");
  const [needsReauth, setNeedsReauth] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(true);

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
    api
      .getSettingValue("onboarding_done")
      .then((value) => setOnboardingDismissed(value === "1"))
      .catch(() => undefined);
  }, []);

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

  const dismissOnboarding = useCallback(() => {
    setOnboardingDismissed(true);
    void api.setSettingValue("onboarding_done", "1").catch(() => undefined);
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
    onboardingDismissed,
    dismissOnboarding,
  };
}

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Theme } from "./view";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    api
      .getSettingValue("theme")
      .then((value) => {
        if (value === "light" || value === "dark" || value === "system") {
          setTheme(value);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
    try {
      if (theme === "system") localStorage.removeItem("facturita-theme");
      else localStorage.setItem("facturita-theme", theme);
    } catch {
      // sin localStorage
    }
  }, [theme]);

  const changeTheme = useCallback((value: Theme) => {
    setTheme(value);
    void api.setSettingValue("theme", value).catch(() => undefined);
  }, []);

  return { theme, changeTheme };
}

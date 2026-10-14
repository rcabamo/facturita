import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

const SETTING_KEY = "onboarding_done";

export function useOnboardingTour() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [done, setDone] = useState(true);

  useEffect(() => {
    api
      .getSettingValue(SETTING_KEY)
      .then((value) => setDone(value === "1"))
      .catch(() => setDone(true))
      .finally(() => setLoaded(true));
  }, []);

  const start = useCallback(() => setOpen(true), []);

  const finish = useCallback(() => {
    setOpen(false);
    setDone(true);
    void api.setSettingValue(SETTING_KEY, "1").catch(() => undefined);
  }, []);

  return { open, loaded, done, canAutoStart: loaded && !done, start, finish };
}

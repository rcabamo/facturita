import { useCallback, useEffect, useState } from "react";
import { api, type RatesConfig } from "./api";
import { formatMoney } from "./format";

export function useRates({
  setError,
  withPending,
  pushToast,
  loadData,
}: {
  setError: (message: string) => void;
  withPending: (key: string, action: () => Promise<void>) => Promise<void>;
  pushToast: (kind: "success" | "error" | "info", message: string) => void;
  loadData: (options?: { silent?: boolean }) => Promise<void>;
}) {
  const [rates, setRates] = useState<RatesConfig>({
    default_rate: 0,
    shared_rate: 0,
    currency: "€",
  });

  useEffect(() => {
    api
      .getRatesConfig()
      .then(setRates)
      .catch((err) => setError(String(err)));
  }, [setError]);

  const money = useCallback(
    (value: number) => formatMoney(value, rates.currency),
    [rates.currency],
  );

  function persistRates(
    patch: Partial<Pick<RatesConfig, "default_rate" | "shared_rate" | "currency">>,
  ) {
    const next = {
      default_rate: patch.default_rate ?? rates.default_rate,
      shared_rate: patch.shared_rate ?? rates.shared_rate,
      currency: patch.currency ?? rates.currency,
    };
    if (
      next.default_rate === rates.default_rate &&
      next.shared_rate === rates.shared_rate &&
      next.currency === rates.currency
    ) {
      return Promise.resolve();
    }
    return withPending("rates", async () => {
      try {
        await api.setRatesConfig(next.default_rate, next.shared_rate, next.currency);
        setRates(await api.getRatesConfig());
        await loadData({ silent: true });
        pushToast("success", "Tarifas guardadas.");
      } catch (err) {
        setError(String(err));
      }
    });
  }

  return { rates, money, persistRates };
}

import { useCallback, useEffect, useState } from "react";
import { api, type ClassGroup, type ClientIncome, type MonthlyIncome } from "./api";
import type { DateRange } from "./dates";
import { ALL_FROM, ALL_TO, type Section, shiftMonth, singleMonthOf } from "./view";

export function useDashboardData({
  from,
  to,
  setError,
}: {
  from: string;
  to: string;
  setError: (message: string | null) => void;
}) {
  const [incomeMonths, setIncomeMonths] = useState<MonthlyIncome[]>([]);
  const [incomeClients, setIncomeClients] = useState<ClientIncome[]>([]);
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [allClients, setAllClients] = useState<ClientIncome[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      setError(null);
      try {
        const [months, clients, groups, everyone, pending] = await Promise.all([
          api.incomeByMonth(from, to),
          api.incomeByClient(from, to, null),
          api.listClasses(ALL_FROM, ALL_TO),
          api.incomeByClient(ALL_FROM, ALL_TO, null),
          api.pendingCount(),
        ]);
        setIncomeMonths(months);
        setIncomeClients(clients);
        setClasses(groups);
        setAllClients(everyone);
        setPendingTotal(pending);
      } catch (err) {
        setError(String(err));
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [from, to, setError],
  );

  return {
    incomeMonths,
    incomeClients,
    classes,
    allClients,
    pendingTotal,
    loading,
    loadData,
  };
}

export function usePrevMonthTotals(section: Section, historyRange: DateRange) {
  const [prevTotals, setPrevTotals] = useState<MonthlyIncome | null>(null);

  useEffect(() => {
    if (section !== "history" || !singleMonthOf(historyRange)) {
      setPrevTotals(null);
      return;
    }
    const previous = shiftMonth(historyRange, -1);
    api
      .incomeByMonth(previous.from, previous.to)
      .then((months) => setPrevTotals(months[0] ?? { month: "", classes: 0, amount: 0 }))
      .catch(() => setPrevTotals(null));
  }, [section, historyRange]);

  return prevTotals;
}

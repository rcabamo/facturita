import { useCallback, useState } from "react";

export function usePendingTasks() {
  const [pending, setPending] = useState<Set<string>>(() => new Set());

  const isPending = useCallback((key: string) => pending.has(key), [pending]);

  const withPending = useCallback(async (key: string, action: () => Promise<void>) => {
    setPending((current) => new Set(current).add(key));
    try {
      await action();
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }, []);

  return { isPending, withPending };
}

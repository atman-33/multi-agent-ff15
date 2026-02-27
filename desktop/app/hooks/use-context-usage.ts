import { useCallback, useEffect, useState } from "react";

const CONTEXT_POLL_INTERVAL_MS = 3000;

export function useContextUsage(): Record<string, number | null> {
  const [contextUsage, setContextUsage] = useState<
    Record<string, number | null>
  >({});

  const fetchContextUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/context-usage");
      if (res.ok) {
        const data = await res.json();
        setContextUsage(data);
      }
    } catch {
      setContextUsage({});
    }
  }, []);

  useEffect(() => {
    fetchContextUsage();
    const interval = setInterval(fetchContextUsage, CONTEXT_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchContextUsage]);

  return contextUsage;
}

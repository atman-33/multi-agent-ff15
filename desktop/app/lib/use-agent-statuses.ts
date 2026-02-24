import { useCallback, useEffect, useState } from "react";

const STATUS_POLL_INTERVAL_MS = 2000;

export function useAgentStatuses(): Record<string, string> {
  const [statuses, setStatuses] = useState<Record<string, string>>({});

  const fetchStatuses = useCallback(async () => {
    try {
      const res = await fetch("/api/agent-statuses");
      if (res.ok) {
        const data = await res.json();
        setStatuses(data);
      }
    } catch (e) {
      console.error("Failed to fetch agent statuses:", e);
    }
  }, []);

  useEffect(() => {
    fetchStatuses();
    const interval = setInterval(fetchStatuses, STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStatuses]);

  return statuses;
}

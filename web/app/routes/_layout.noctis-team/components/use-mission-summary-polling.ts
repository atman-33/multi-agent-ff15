import { useEffect, useRef } from "react";

const VISIBLE_POLL_MS = 3000;

export function useMissionSummaryPolling(options: {
  enabled?: boolean;
  onPoll: () => void | Promise<void>;
}) {
  const enabled = options.enabled ?? true;
  const onPollRef = useRef(options.onPoll);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    onPollRef.current = options.onPoll;
  }, [options.onPoll]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const clearPolling = () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    const startPolling = () => {
      clearPolling();
      if (document.visibilityState === "hidden") {
        return;
      }

      timerRef.current = window.setInterval(() => {
        void onPollRef.current();
      }, VISIBLE_POLL_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearPolling();
        return;
      }

      void onPollRef.current();
      startPolling();
    };

    void onPollRef.current();
    startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearPolling();
    };
  }, [enabled]);
}
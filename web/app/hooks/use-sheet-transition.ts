import { useCallback, useEffect, useRef, useState } from "react";

export interface SheetTransitionOptions {
  activeKey: string | null;
  closeDurationMs: number;
  onCloseComplete: () => void;
}

export interface SheetTransitionState {
  handleContentAnimationEnd: (event: {
    currentTarget: { getAttribute: (name: string) => string | null };
    target: unknown;
  }) => void;
  handleOpenChange: (open: boolean) => void;
  isSheetOpen: boolean;
  isVisualRouteActive: boolean;
  reopen: () => void;
}

export function useSheetTransition({
  activeKey,
  closeDurationMs,
  onCloseComplete,
}: SheetTransitionOptions): SheetTransitionState {
  const closeTimeoutRef = useRef<number | null>(null);
  const closingKeyRef = useRef<string | null>(null);
  const closeCommittedRef = useRef(false);
  const isClosingRef = useRef(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const setClosingState = useCallback((next: boolean) => {
    isClosingRef.current = next;
    setIsClosing(next);
  }, []);

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const reopen = useCallback(() => {
    clearCloseTimeout();
    closeCommittedRef.current = false;
    closingKeyRef.current = null;
    setClosingState(false);
    setIsSheetOpen(true);
  }, [clearCloseTimeout, setClosingState]);

  const finalizeClose = useCallback(() => {
    if (!isClosingRef.current) {
      return;
    }

    if (closeCommittedRef.current) {
      return;
    }

    clearCloseTimeout();
    closeCommittedRef.current = true;
    onCloseComplete();
  }, [clearCloseTimeout, onCloseComplete]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        if (isClosingRef.current && closingKeyRef.current === activeKey) {
          return;
        }

        reopen();
        return;
      }

      if (isClosingRef.current) {
        return;
      }

      clearCloseTimeout();
      closeCommittedRef.current = false;
      closingKeyRef.current = activeKey;
      setClosingState(true);
      setIsSheetOpen(false);
      // Use timeout as a safety net only; animationend should usually finalize first.
      const closeFallbackMs = closeDurationMs * 2;
      closeTimeoutRef.current = window.setTimeout(() => {
        closeTimeoutRef.current = null;
        finalizeClose();
      }, closeFallbackMs);
    },
    [activeKey, clearCloseTimeout, closeDurationMs, finalizeClose, reopen, setClosingState],
  );

  const handleContentAnimationEnd = useCallback(
    (event: {
      currentTarget: { getAttribute: (name: string) => string | null };
      target: unknown;
    }) => {
      const state = event.currentTarget.getAttribute("data-state");
      if (event.target !== event.currentTarget) {
        return;
      }

      if (state !== "closed") {
        return;
      }

      finalizeClose();
    },
    [finalizeClose],
  );

  useEffect(() => {
    if (!activeKey) {
      clearCloseTimeout();
      closeCommittedRef.current = false;
      closingKeyRef.current = null;
      setClosingState(false);
      setIsSheetOpen(false);
      return;
    }

    if (isClosingRef.current && closingKeyRef.current === activeKey) {
      return;
    }

    reopen();
  }, [activeKey, clearCloseTimeout, reopen, setClosingState]);

  useEffect(() => {
    return () => {
      clearCloseTimeout();
    };
  }, [clearCloseTimeout]);

  return {
    handleContentAnimationEnd,
    handleOpenChange,
    isSheetOpen,
    isVisualRouteActive: Boolean(activeKey) && !isClosing,
    reopen,
  };
}

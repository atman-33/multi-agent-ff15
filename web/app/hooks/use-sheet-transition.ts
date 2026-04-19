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
    closingKeyRef.current = null;
    setClosingState(false);
    setIsSheetOpen(true);
  }, [clearCloseTimeout, setClosingState]);

  const finalizeClose = useCallback(() => {
    if (!isClosingRef.current) {
      return;
    }

    clearCloseTimeout();
    closingKeyRef.current = null;
    setClosingState(false);
    onCloseComplete();
  }, [clearCloseTimeout, onCloseComplete, setClosingState]);

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
      closingKeyRef.current = activeKey;
      setClosingState(true);
      setIsSheetOpen(false);
      closeTimeoutRef.current = window.setTimeout(() => {
        closeTimeoutRef.current = null;
        finalizeClose();
      }, closeDurationMs);
    },
    [activeKey, clearCloseTimeout, closeDurationMs, finalizeClose, reopen, setClosingState],
  );

  const handleContentAnimationEnd = useCallback(
    (event: {
      currentTarget: { getAttribute: (name: string) => string | null };
      target: unknown;
    }) => {
      if (event.target !== event.currentTarget) {
        return;
      }

      if (event.currentTarget.getAttribute("data-state") !== "closed") {
        return;
      }

      finalizeClose();
    },
    [finalizeClose],
  );

  useEffect(() => {
    if (!activeKey) {
      clearCloseTimeout();
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

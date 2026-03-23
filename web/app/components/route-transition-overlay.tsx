import { useEffect, useRef, useState } from "react";
import { useNavigation } from "react-router";
import { cn } from "@/lib/utils";

const SHOW_DELAY_MS = 150;
const MIN_VISIBLE_MS = 360;
const FADE_OUT_MS = 280;

type RouteTransitionOverlayProps = {
  className?: string;
};

export function RouteTransitionOverlay({ className }: RouteTransitionOverlayProps) {
  const navigation = useNavigation();
  const [isMounted, setIsMounted] = useState(false);
  const [isFadedIn, setIsFadedIn] = useState(false);
  const showTimerRef = useRef<number | null>(null);
  const fadeInTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const unmountTimerRef = useRef<number | null>(null);
  const shownAtRef = useRef<number | null>(null);

  const isRouteTransition = navigation.state !== "idle" && navigation.location != null;

  useEffect(() => {
    return () => {
      for (const ref of [showTimerRef, fadeInTimerRef, hideTimerRef, unmountTimerRef]) {
        if (ref.current !== null) window.clearTimeout(ref.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isMounted) {
      setIsFadedIn(false);
      return;
    }

    fadeInTimerRef.current = window.setTimeout(() => {
      setIsFadedIn(true);
      fadeInTimerRef.current = null;
    }, 16);

    return () => {
      if (fadeInTimerRef.current !== null) {
        window.clearTimeout(fadeInTimerRef.current);
        fadeInTimerRef.current = null;
      }
    };
  }, [isMounted]);

  useEffect(() => {
    for (const ref of [showTimerRef, hideTimerRef]) {
      if (ref.current !== null) {
        window.clearTimeout(ref.current);
        ref.current = null;
      }
    }

    if (isRouteTransition) {
      if (!isMounted) {
        showTimerRef.current = window.setTimeout(() => {
          shownAtRef.current = Date.now();
          setIsMounted(true);
          showTimerRef.current = null;
        }, SHOW_DELAY_MS);
      } else if (unmountTimerRef.current !== null) {
        window.clearTimeout(unmountTimerRef.current);
        unmountTimerRef.current = null;
        setIsFadedIn(true);
      }
      return;
    }

    if (!isMounted) {
      shownAtRef.current = null;
      return;
    }

    const elapsed = shownAtRef.current === null ? MIN_VISIBLE_MS : Date.now() - shownAtRef.current;
    const remaining = Math.max(MIN_VISIBLE_MS - elapsed, 0);

    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setIsFadedIn(false);
      unmountTimerRef.current = window.setTimeout(() => {
        shownAtRef.current = null;
        setIsMounted(false);
        unmountTimerRef.current = null;
      }, FADE_OUT_MS);
    }, remaining);
  }, [isRouteTransition, isMounted]);

  if (!isMounted) {
    return null;
  }

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading next screen"
      className={cn(
        "absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-background/60 backdrop-blur-[3px] transition-opacity",
        isFadedIn ? "opacity-100 duration-180" : "opacity-0 duration-280",
        className
      )}
      role="status"
    >
      {/* Top progress shimmer */}
      <div className="route-loading-progress absolute inset-x-0 top-0 h-px bg-amber-400/10" />

      {/* Center stage — no card border, pure depth */}
      <div className="relative flex w-full max-w-lg flex-col items-center gap-0 text-center">
        {/* Soft ambient glow behind chocobo */}
        <div className="route-loading-glow absolute top-1/2 left-1/2 h-28 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full" />

        {/* Ground line */}
        <div className="route-loading-ground relative mx-auto mb-0 h-px w-full max-w-xs" />

        {/* Track area: chocobo + dust particles */}
        <div className="route-loading-track relative h-24 w-full max-w-xs" aria-hidden="true">
          {/* Dust particle dots */}
          <span className="route-loading-dust route-loading-dust-1" />
          <span className="route-loading-dust route-loading-dust-2" />
          <span className="route-loading-dust route-loading-dust-3" />
          <span className="route-loading-dust route-loading-dust-4" />
          <span className="route-loading-dust route-loading-dust-5" />

          {/* Chocobo sprite */}
          <div className="route-loading-chocobo">
            <img
              alt=""
              className="route-loading-chocobo-sprite h-16 w-16"
              src="/images/chocobo.png"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        </div>

        {/* Label */}
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] text-amber-100/40">
          Loading...
        </p>
      </div>
    </div>
  );
}
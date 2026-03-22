import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getAgentTheme } from "@/lib/agent-theme";
import { cn } from "@/lib/utils";

export interface BanterEntry {
  id: string;
  speakerId: string;
  speakerName: string;
  speakerAvatar: string;
  message: string;
  timestamp: Date;
}

interface BanterLogProps {
  entries: BanterEntry[];
  latestEntryId?: string | null;
}

const formatTime = (date: Date): string => {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

export const BanterLog = ({ entries, latestEntryId = null }: BanterLogProps) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(entries.length);
  const liveBadgeFadeTimeoutRef = useRef<number | null>(null);
  const liveBadgeClearTimeoutRef = useRef<number | null>(null);
  const highlightFadeTimeoutRef = useRef<number | null>(null);
  const highlightClearTimeoutRef = useRef<number | null>(null);
  const [liveBadgeEntryId, setLiveBadgeEntryId] = useState<string | null>(latestEntryId);
  const [isLiveBadgeVisible, setIsLiveBadgeVisible] = useState(Boolean(latestEntryId));
  const [highlightEntryId, setHighlightEntryId] = useState<string | null>(latestEntryId);
  const [isHighlightActive, setIsHighlightActive] = useState(Boolean(latestEntryId));

  useEffect(() => {
    if (entries.length !== prevLengthRef.current) {
      prevLengthRef.current = entries.length;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  });

  useEffect(() => {
    if (liveBadgeFadeTimeoutRef.current !== null) {
      window.clearTimeout(liveBadgeFadeTimeoutRef.current);
      liveBadgeFadeTimeoutRef.current = null;
    }
    if (liveBadgeClearTimeoutRef.current !== null) {
      window.clearTimeout(liveBadgeClearTimeoutRef.current);
      liveBadgeClearTimeoutRef.current = null;
    }
    if (highlightFadeTimeoutRef.current !== null) {
      window.clearTimeout(highlightFadeTimeoutRef.current);
      highlightFadeTimeoutRef.current = null;
    }
    if (highlightClearTimeoutRef.current !== null) {
      window.clearTimeout(highlightClearTimeoutRef.current);
      highlightClearTimeoutRef.current = null;
    }

    if (!latestEntryId) {
      setLiveBadgeEntryId(null);
      setIsLiveBadgeVisible(false);
      setHighlightEntryId(null);
      setIsHighlightActive(false);
      return;
    }

    setLiveBadgeEntryId(latestEntryId);
    setIsLiveBadgeVisible(true);
    setHighlightEntryId(latestEntryId);
    setIsHighlightActive(true);

    liveBadgeFadeTimeoutRef.current = window.setTimeout(() => {
      setIsLiveBadgeVisible(false);
      liveBadgeFadeTimeoutRef.current = null;
    }, 2400);

    highlightFadeTimeoutRef.current = window.setTimeout(() => {
      setIsHighlightActive(false);
      highlightFadeTimeoutRef.current = null;
    }, 2600);

    liveBadgeClearTimeoutRef.current = window.setTimeout(() => {
      setLiveBadgeEntryId((currentEntryId) =>
        currentEntryId === latestEntryId ? null : currentEntryId
      );
      liveBadgeClearTimeoutRef.current = null;
    }, 3200);

    highlightClearTimeoutRef.current = window.setTimeout(() => {
      setHighlightEntryId((currentEntryId) =>
        currentEntryId === latestEntryId ? null : currentEntryId
      );
      highlightClearTimeoutRef.current = null;
    }, 3400);

    return () => {
      if (liveBadgeFadeTimeoutRef.current !== null) {
        window.clearTimeout(liveBadgeFadeTimeoutRef.current);
        liveBadgeFadeTimeoutRef.current = null;
      }
      if (liveBadgeClearTimeoutRef.current !== null) {
        window.clearTimeout(liveBadgeClearTimeoutRef.current);
        liveBadgeClearTimeoutRef.current = null;
      }
      if (highlightFadeTimeoutRef.current !== null) {
        window.clearTimeout(highlightFadeTimeoutRef.current);
        highlightFadeTimeoutRef.current = null;
      }
      if (highlightClearTimeoutRef.current !== null) {
        window.clearTimeout(highlightClearTimeoutRef.current);
        highlightClearTimeoutRef.current = null;
      }
    };
  }, [latestEntryId]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-border/50 border-b pb-2">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[hsl(var(--success))]" />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Comms Log
        </span>
        <div className="ml-auto font-mono text-[10px] text-muted-foreground/50">
          {entries.length} entries
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1.5 pr-2">
          {entries.map((entry) => {
            const isLatestEntry = entry.id === latestEntryId;
            const isHighlightedEntry = entry.id === highlightEntryId;
            const showActiveHighlight = isHighlightedEntry && isHighlightActive;
            const showLiveBadge = entry.id === liveBadgeEntryId;
            const theme = getAgentTheme(entry.speakerId);

            return (
            <div
              key={entry.id}
              className={cn(
                "flex items-start gap-2 rounded-md border border-transparent bg-muted/20 px-2 py-1.5 transition-all duration-700 ease-out",
                showActiveHighlight && "shadow-[0_0_24px_rgba(125,211,252,0.2)]"
              )}
              style={{
                borderColor: showActiveHighlight ? theme?.ring ?? "rgba(125, 211, 252, 0.4)" : undefined,
                background: showActiveHighlight ? theme?.surfaceStrong ?? "rgba(14, 165, 233, 0.12)" : undefined,
                boxShadow: showActiveHighlight ? `0 0 24px ${theme?.glowSoft ?? "rgba(125,211,252,0.2)"}` : undefined,
                animation: isLatestEntry
                  ? "banter-entry-in 0.42s cubic-bezier(0.22, 1, 0.36, 1), banter-fresh 1.5s ease-out"
                  : "banter-entry-in 0.34s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              <div
                className={cn(
                  "mt-0.5 h-8 w-0.5 shrink-0 rounded-full bg-transparent transition-all duration-700 ease-out",
                  showActiveHighlight && "shadow-[0_0_12px_rgba(125,211,252,0.82)]"
                )}
                style={
                  showActiveHighlight
                    ? {
                        animation: "banter-accent-pulse 1.2s ease-in-out infinite",
                        background: theme?.accentStrong ?? "rgba(125, 211, 252, 0.9)",
                        boxShadow: `0 0 12px ${theme?.glow ?? "rgba(125,211,252,0.82)"}`,
                      }
                    : undefined
                }
              />
              <div
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ring-1 ring-white/6"
                style={{
                  borderColor: theme?.ring ?? "rgba(148, 163, 184, 0.35)",
                  background: theme?.portraitBg ?? "rgba(15, 23, 42, 0.9)",
                  boxShadow: `0 0 18px ${showActiveHighlight ? theme?.glowSoft ?? "rgba(125,211,252,0.12)" : "rgba(0,0,0,0)"}`,
                }}
              >
                <img
                  alt={entry.speakerName}
                  src={entry.speakerAvatar}
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
              </div>
              <div
                className="min-w-0 flex-1"
                style={{
                  animation: isLatestEntry
                    ? "banter-card-reveal 0.44s ease-out 0.06s both"
                    : "banter-card-reveal 0.36s ease-out 0.04s both",
                }}
              >
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="shrink-0 font-mono text-[10px] font-semibold uppercase"
                    style={{ color: theme?.text ?? "rgba(226, 232, 240, 0.88)" }}
                  >
                    {entry.speakerName}
                  </span>
                  {showLiveBadge ? (
                    <span
                      className={cn(
                        "rounded-full border px-1 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.18em] transition-all duration-500 ease-out",
                        isLiveBadgeVisible ? "translate-y-0 opacity-100" : "-translate-y-0.5 opacity-0"
                      )}
                      style={{
                        borderColor: theme?.ring ?? "rgba(56, 189, 248, 0.45)",
                        background: theme?.surfaceStrong ?? "rgba(14, 165, 233, 0.18)",
                        color: theme?.text ?? "rgba(224, 242, 254, 0.95)",
                        boxShadow: `0 0 12px ${theme?.glowSoft ?? "rgba(56,189,248,0.2)"}`,
                        animation: isLiveBadgeVisible
                          ? "banter-live-pulse 1.35s ease-in-out infinite"
                          : undefined,
                      }}
                    >
                      live
                    </span>
                  ) : null}
                  <span className="font-mono text-[9px] text-muted-foreground/40">
                    {formatTime(entry.timestamp)}
                  </span>
                </div>
                <p className="font-mono text-[10px] leading-relaxed text-muted-foreground/80">
                  {entry.message}
                </p>
              </div>
            </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
};

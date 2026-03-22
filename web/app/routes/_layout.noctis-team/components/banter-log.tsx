import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
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

  useEffect(() => {
    if (entries.length !== prevLengthRef.current) {
      prevLengthRef.current = entries.length;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  });

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
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "flex items-start gap-2 rounded-md border border-transparent bg-muted/20 px-2 py-1.5 transition-all",
                entry.id === latestEntryId &&
                  "border-sky-300/40 bg-sky-500/12 shadow-[0_0_24px_rgba(125,211,252,0.2)]"
              )}
              style={{
                animation:
                  entry.id === latestEntryId
                    ? "banter-entry-in 0.42s cubic-bezier(0.22, 1, 0.36, 1), banter-fresh 1.5s ease-out"
                    : "banter-entry-in 0.34s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              <div
                className={cn(
                  "mt-0.5 h-8 w-0.5 shrink-0 rounded-full bg-transparent transition-colors",
                  entry.id === latestEntryId && "bg-sky-300/90 shadow-[0_0_12px_rgba(125,211,252,0.82)]"
                )}
                style={
                  entry.id === latestEntryId
                    ? { animation: "banter-accent-pulse 1.2s ease-in-out infinite" }
                    : undefined
                }
              />
              <img
                alt={entry.speakerName}
                src={entry.speakerAvatar}
                className="mt-0.5 h-4 w-auto shrink-0 object-contain"
              />
              <div
                className="min-w-0 flex-1"
                style={{
                  animation:
                    entry.id === latestEntryId
                      ? "banter-card-reveal 0.44s ease-out 0.06s both"
                      : "banter-card-reveal 0.36s ease-out 0.04s both",
                }}
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="shrink-0 font-mono text-[10px] font-semibold text-primary/80 uppercase">
                    {entry.speakerName}
                  </span>
                  {entry.id === latestEntryId ? (
                    <span
                      className="rounded-full border border-sky-300/45 bg-sky-500/18 px-1 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-sky-100/95 shadow-[0_0_12px_rgba(56,189,248,0.2)]"
                      style={{ animation: "banter-live-pulse 1.35s ease-in-out infinite" }}
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
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
};

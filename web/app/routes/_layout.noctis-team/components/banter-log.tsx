import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

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
}

const formatTime = (date: Date): string => {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

export const BanterLog = ({ entries }: BanterLogProps) => {
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
              className="flex items-start gap-2 rounded-md bg-muted/20 px-2 py-1.5 transition-all"
              style={{ animation: "fadeInUp 0.3s ease-out" }}
            >
              <img
                alt={entry.speakerName}
                src={entry.speakerAvatar}
                className="mt-0.5 h-4 w-auto shrink-0 object-contain"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="shrink-0 font-mono text-[10px] font-semibold text-primary/80 uppercase">
                    {entry.speakerName}
                  </span>
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

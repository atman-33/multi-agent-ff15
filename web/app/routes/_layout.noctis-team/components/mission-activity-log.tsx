import { Clock3, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getLunafreyaJobDisplayLabel } from "@/lib/lunafreya-prompt-context";
import { getActivityActorLabel } from "@/lib/team-message-format";
import type { MissionActivityLogEntry } from "@/lib/types/mission";
import { cn } from "@/lib/utils";

type MissionActivityLogProps = {
  entries: MissionActivityLogEntry[];
};

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getEntryTone(entry: MissionActivityLogEntry): string {
  switch (entry.kind) {
    case "user_message":
      return "border-sky-400/20 bg-sky-500/8";
    case "system_event":
      return "border-amber-400/20 bg-amber-500/8";
    default:
      return "border-border/60 bg-card/40";
  }
}

function getEntryBody(entry: MissionActivityLogEntry): string {
  if (!entry.source?.lunafreyaFacetSnapshot) {
    return entry.body;
  }

  const lines = entry.body
    .split("\n")
    .filter((line) => !line.startsWith("Job:") && !line.startsWith("Skills:"));

  return lines.join("\n").trim() || entry.body;
}

export function MissionActivityLog({ entries }: MissionActivityLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(entries.length);

  useEffect(() => {
    if (entries.length !== prevLengthRef.current) {
      prevLengthRef.current = entries.length;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-border/50 border-b px-3 py-2.5">
        <Sparkles className="h-4 w-4 text-primary/80" />
        <div>
          <h3 className="font-semibold text-sm">Activity</h3>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
            Mission timeline
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center">
          <div className="space-y-2 rounded-xl border border-border/50 bg-card/40 px-4 py-6">
            <p className="font-semibold text-sm">No activity yet</p>
            <p className="text-muted-foreground text-xs leading-5">
              Facet changes and mission events will appear here.
            </p>
          </div>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 p-3">
            {entries.map((entry) => {
              const facetSnapshot = entry.source?.lunafreyaFacetSnapshot;

              return (
                <article
                  key={entry.id}
                  className={cn(
                    "space-y-2 rounded-xl border px-3 py-3 shadow-sm",
                    getEntryTone(entry),
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                        {getActivityActorLabel(entry.speaker)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                        {getEntryBody(entry)}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground/80">
                      <Clock3 className="h-3 w-3" />
                      {formatTimestamp(entry.createdAt)}
                    </span>
                  </div>

                  {facetSnapshot ? (
                    <div className="space-y-2 rounded-lg border border-border/50 bg-background/40 px-2.5 py-2">
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                        Applied context
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="rounded-full border border-border/60 bg-background/75 px-2 py-0.5 text-[10px] text-foreground/85">
                          Job: {getLunafreyaJobDisplayLabel(facetSnapshot)}
                        </span>
                        {facetSnapshot.selectedSkillLabels.length > 0 ? (
                          facetSnapshot.selectedSkillLabels.map((label) => (
                            <span
                              key={`${entry.id}:${label}`}
                              className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] text-primary/90"
                            >
                              {label}
                            </span>
                          ))
                        ) : (
                          <span className="rounded-full border border-border/60 bg-background/75 px-2 py-0.5 text-[10px] text-muted-foreground/80">
                            Skills: none
                          </span>
                        )}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
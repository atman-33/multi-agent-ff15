import {
  ArrowUpRight,
  Bot,
  ChevronDown,
  Clock3,
  Sparkles,
  Wrench,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import ChatMarkdown, { stripAnsi } from "@/components/chat-markdown";
import ExecutionCard from "@/components/execution-card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  type ChatDetailItem,
  MESSAGE_PREVIEW_MAX_CHARS,
  truncateText,
} from "@/lib/chat-detail";
import type { ChatTimelineTurnItem } from "@/lib/chat-timeline";
import { cn } from "@/lib/utils";

function renderLifecycleLabel(state: string): string {
  if (state === "started") {
    return "Turn started";
  }
  if (state === "completed") {
    return "Turn completed";
  }
  if (state === "failed") {
    return "Turn failed";
  }
  return `Turn ${state}`;
}

function formatTurnTime(item: ChatTimelineTurnItem): string {
  const ts = new Date(item.lastTs);
  const showFineGrainedTime =
    Math.abs(ts.getTime() - new Date(item.firstTs).getTime()) < 1000;

  return ts.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    ...(showFineGrainedTime ? { fractionalSecondDigits: 3 as const } : {}),
  });
}

interface TurnCardProps {
  item: ChatTimelineTurnItem;
  onOpenDetail?: (item: ChatDetailItem) => void;
}

function TurnCard({ item, onOpenDetail }: TurnCardProps) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const primaryContent = useMemo(
    () => stripAnsi(item.primaryMessage?.content ?? ""),
    [item.primaryMessage?.content]
  );
  const supportingMessages = item.supportingMessages.filter(
    (message) => stripAnsi(message.content).trim().length > 0
  );
  const statusMessages = item.statuses.filter(
    (message) => stripAnsi(message.content).trim().length > 0
  );
  const hasPrimary = primaryContent.trim().length > 0;
  const previewContent = useMemo(
    () =>
      primaryContent.length > MESSAGE_PREVIEW_MAX_CHARS
        ? truncateText(primaryContent, MESSAGE_PREVIEW_MAX_CHARS)
        : primaryContent,
    [primaryContent]
  );
  const shouldFold = primaryContent.length > MESSAGE_PREVIEW_MAX_CHARS;
  const hasDetails =
    item.executions.length > 0 ||
    supportingMessages.length > 0 ||
    statusMessages.length > 0 ||
    item.lifecycle.length > 0;
  const timeStr = useMemo(() => formatTurnTime(item), [item]);

  return (
    <div className="group/turn space-y-1.5">
      <div className="rounded-lg border border-border/40 bg-white/[0.045] px-3 py-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span>{timeStr}</span>
          <Badge
            className="border-sky-500/20 bg-sky-500/10 text-sky-100"
            variant="outline"
          >
            Turn
          </Badge>
          {item.primaryMessage ? (
            <Badge
              className="border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
              variant="outline"
            >
              Final answer
            </Badge>
          ) : null}
          {item.executions.length > 0 ? (
            <Badge
              className="border-violet-500/20 bg-violet-500/10 text-violet-200"
              variant="outline"
            >
              {item.executions.length} detail
              {item.executions.length === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>

        <div className="mt-2 space-y-2">
          {hasPrimary ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium text-[10px] text-foreground/65 uppercase tracking-[0.14em]">
                <Bot className="h-3.5 w-3.5" />
                Answer
              </div>
              <ChatMarkdown
                className="space-y-1 text-foreground/90 text-xs leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                content={
                  shouldFold && !detailsExpanded
                    ? previewContent
                    : primaryContent
                }
              />
            </div>
          ) : (
            <div className="rounded-md border border-border/40 border-dashed bg-black/10 px-2.5 py-2 text-[11px] text-muted-foreground/80">
              No final answer text was captured for this turn.
            </div>
          )}

          {hasDetails ? (
            <>
              <Separator className="bg-white/10" />
              <button
                className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                onClick={() => setDetailsExpanded((value) => !value)}
                type="button"
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform duration-300 ease-out",
                    detailsExpanded ? "rotate-180" : "rotate-0"
                  )}
                />
                <span className="font-medium">
                  {detailsExpanded ? "Hide turn details" : "Show turn details"}
                </span>
                <span className="text-[10px] text-muted-foreground/70">
                  {item.executions.length > 0
                    ? `${item.executions.length} tool/plan activities`
                    : "Supporting context"}
                </span>
              </button>

              <div
                className={cn(
                  "grid transition-all duration-300 ease-out",
                  detailsExpanded
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0"
                )}
              >
                <div className="overflow-hidden">
                  <div
                    className={cn(
                      "space-y-3 pt-2 transition-all duration-300 ease-out",
                      detailsExpanded ? "translate-y-0" : "-translate-y-1"
                    )}
                  >
                    {supportingMessages.length > 0 ? (
                      <section className="space-y-2">
                        <div className="flex items-center gap-1.5 font-medium text-[10px] text-muted-foreground/70 uppercase tracking-[0.14em]">
                          <Sparkles className="h-3.5 w-3.5" />
                          Assistant fragments
                        </div>
                        {supportingMessages.map((message) => (
                          <div
                            className="rounded-md border border-border/30 bg-black/10 px-2.5 py-2"
                            key={message.key}
                          >
                            <ChatMarkdown
                              className="space-y-1 text-[11px] text-foreground/85 leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                              content={stripAnsi(message.content)}
                            />
                          </div>
                        ))}
                      </section>
                    ) : null}

                    {statusMessages.length > 0 ? (
                      <section className="space-y-2">
                        <div className="flex items-center gap-1.5 font-medium text-[10px] text-muted-foreground/70 uppercase tracking-[0.14em]">
                          <Clock3 className="h-3.5 w-3.5" />
                          Status
                        </div>
                        {statusMessages.map((message) => (
                          <div
                            className="rounded-md border border-border/30 bg-black/10 px-2.5 py-2 text-[11px] text-foreground/80"
                            key={message.key}
                          >
                            {stripAnsi(message.content)}
                          </div>
                        ))}
                      </section>
                    ) : null}

                    {item.executions.length > 0 ? (
                      <section className="space-y-2">
                        <div className="flex items-center gap-1.5 font-medium text-[10px] text-muted-foreground/70 uppercase tracking-[0.14em]">
                          <Wrench className="h-3.5 w-3.5" />
                          Tool & plan activity
                        </div>
                        <div className="space-y-2">
                          {item.executions.map((execution) => (
                            <ExecutionCard
                              defaultExpanded={false}
                              item={execution}
                              key={execution.key}
                              onOpenDetail={onOpenDetail}
                            />
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {item.lifecycle.length > 0 ? (
                      <section className="space-y-2">
                        <div className="font-medium text-[10px] text-muted-foreground/70 uppercase tracking-[0.14em]">
                          Turn lifecycle
                        </div>
                        <div className="space-y-1 rounded-md border border-border/30 bg-black/10 px-2.5 py-2 text-[11px] text-muted-foreground/85">
                          {item.lifecycle.map((entry) => (
                            <div
                              className="flex items-center justify-between gap-3"
                              key={entry.id}
                            >
                              <span>{renderLifecycleLabel(entry.state)}</span>
                              <span className="shrink-0 text-[10px] text-muted-foreground/60">
                                {new Date(entry.ts).toLocaleTimeString(
                                  "en-US",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  }
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {onOpenDetail ? (
        <div className="flex justify-start opacity-0 transition-opacity group-hover/turn:opacity-100">
          <button
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            onClick={() => onOpenDetail({ type: "turn", item })}
            title="Open full turn detail"
            type="button"
          >
            <ArrowUpRight className="h-3 w-3" />
            Open detail
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default memo(TurnCard);

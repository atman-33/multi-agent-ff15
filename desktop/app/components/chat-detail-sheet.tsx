import {
  Check,
  CheckCircle2,
  Circle,
  CircleSlash,
  Copy,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import ChatMarkdown, { stripAnsi } from "@/components/chat-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ChatDetailItem } from "@/lib/chat-detail";
import { getExecutionInputText } from "@/lib/chat-detail";
import type { ChatTimelineExecutionItem } from "@/lib/chat-timeline";
import { cn } from "@/lib/utils";

function DetailCodeBlock({ content }: { content: string }) {
  const [wrap, setWrap] = useState(false);

  return (
    <div className="group relative">
      <button
        className="absolute top-2 right-2 z-10 rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-muted-foreground/70 leading-none opacity-0 transition-opacity hover:bg-white/20 hover:text-foreground/80 group-hover:opacity-100"
        onClick={() => setWrap((value) => !value)}
        type="button"
      >
        {wrap ? "→ scroll" : "↵ wrap"}
      </button>
      <pre
        className={cn(
          "overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-[11px] text-slate-100",
          wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
        )}
      >
        {content}
      </pre>
    </div>
  );
}

function renderTodoStatus(status: string): string {
  if (status === "completed") {
    return "✓";
  }
  if (status === "in-progress" || status === "in_progress") {
    return "•";
  }
  return "○";
}

function renderTurnLifecycleLabel(state: string): string {
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

function getStateMeta(state: ChatTimelineExecutionItem["state"]): {
  Icon: typeof LoaderCircle;
  badgeClassName: string;
  label: string;
} {
  if (state === "pending") {
    return {
      Icon: Circle,
      badgeClassName: "border-slate-500/30 bg-slate-500/10 text-slate-300",
      label: "Pending",
    };
  }
  if (state === "completed") {
    return {
      Icon: CheckCircle2,
      badgeClassName:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      label: "Done",
    };
  }
  if (state === "failed") {
    return {
      Icon: TriangleAlert,
      badgeClassName: "border-red-500/30 bg-red-500/10 text-red-300",
      label: "Failed",
    };
  }
  if (state === "interrupted") {
    return {
      Icon: CircleSlash,
      badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      label: "Interrupted",
    };
  }
  return {
    Icon: LoaderCircle,
    badgeClassName: "border-blue-500/30 bg-blue-500/10 text-blue-300",
    label: "Running",
  };
}

function DetailSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] text-slate-400 uppercase tracking-[0.18em]">
        {title}
      </div>
      {children}
    </section>
  );
}

interface ChatDetailSheetProps {
  activeLabel: string;
  item: ChatDetailItem | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export default function ChatDetailSheet({
  activeLabel,
  item,
  onOpenChange,
  open,
}: ChatDetailSheetProps) {
  const [copied, setCopied] = useState(false);

  const timestamp = useMemo(() => {
    if (!item) {
      return "";
    }

    return new Date(item.item.lastTs).toLocaleString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      month: "short",
      day: "numeric",
    });
  }, [item]);

  const copyText = useMemo(() => {
    if (!item) {
      return "";
    }

    if (item.type === "message") {
      return stripAnsi(item.item.content);
    }

    if (item.type === "turn") {
      return [
        item.item.primaryMessage?.content
          ? `Answer\n${stripAnsi(item.item.primaryMessage.content)}`
          : null,
        item.item.supportingMessages.length > 0
          ? `Assistant fragments\n${item.item.supportingMessages
              .map((message) => stripAnsi(message.content))
              .join("\n\n")}`
          : null,
        item.item.statuses.length > 0
          ? `Status\n${item.item.statuses
              .map((message) => stripAnsi(message.content))
              .join("\n")}`
          : null,
        item.item.executions.length > 0
          ? `Tool & Plan Activity\n${item.item.executions
              .map((execution) => {
                const inputText = getExecutionInputText(execution);
                return [
                  execution.title,
                  `State: ${execution.state}`,
                  inputText ? `Input\n${inputText}` : null,
                  execution.result ? `Result\n${execution.result}` : null,
                ]
                  .filter(Boolean)
                  .join("\n");
              })
              .join("\n\n")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    const inputText = getExecutionInputText(item.item);
    return [
      item.item.title,
      `State: ${item.item.state}`,
      inputText ? `Input\n${inputText}` : null,
      item.item.result ? `Result\n${item.item.result}` : null,
      item.item.isPlan && item.item.todos.length > 0
        ? `Plan\n${item.item.todos
            .map((todo) => `${renderTodoStatus(todo.status)} ${todo.title}`)
            .join("\n")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");
  }, [item]);

  const handleCopy = useCallback(() => {
    if (!copyText) {
      return;
    }

    navigator.clipboard.writeText(copyText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [copyText]);

  const executionStateMeta =
    item?.type === "execution" ? getStateMeta(item.item.state) : null;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="flex w-[96vw] max-w-[96vw] flex-col gap-0 border-white/10 bg-slate-950/96 p-0 text-slate-100 backdrop-blur-xl sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl"
        side="right"
      >
        <SheetHeader className="border-white/10 border-b px-5 py-4 text-left sm:px-6">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className="border-white/10 bg-white/10 text-slate-100"
                  variant="outline"
                >
                  {activeLabel}
                </Badge>
                <Badge
                  className={cn(
                    "border-white/10 bg-white/5 text-slate-200",
                    executionStateMeta?.badgeClassName
                  )}
                  variant="outline"
                >
                  {item?.type === "execution"
                    ? executionStateMeta?.label
                    : item?.type === "turn"
                      ? "Turn"
                      : (item?.item.kind ?? "answer")}
                </Badge>
              </div>
              <SheetTitle>
                {item?.type === "execution"
                  ? item.item.isPlan
                    ? "Task plan detail"
                    : item.item.title
                  : item?.type === "turn"
                    ? "Turn detail"
                    : "Message detail"}
              </SheetTitle>
              <SheetDescription className="text-slate-400">
                {timestamp ? `${timestamp} · Full detail view` : ""}
              </SheetDescription>
            </div>

            <Button
              className="shrink-0 border-white/10 text-slate-100 hover:bg-white/10 hover:text-white"
              onClick={handleCopy}
              size="sm"
              type="button"
              variant="outline"
            >
              {copied ? (
                <>
                  <Check className="mr-1 h-3.5 w-3.5 text-emerald-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {item ? (
            item.type === "message" ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                  <ChatMarkdown
                    className="space-y-2 text-[13px] text-slate-100 leading-7 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                    content={stripAnsi(item.item.content)}
                  />
                </div>
              </div>
            ) : item.type === "turn" ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                  {item.item.primaryMessage ? (
                    <ChatMarkdown
                      className="space-y-2 text-[13px] text-slate-100 leading-7 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                      content={stripAnsi(item.item.primaryMessage.content)}
                    />
                  ) : (
                    <div className="text-slate-400 text-sm">
                      No final answer text was captured for this turn.
                    </div>
                  )}
                </div>

                {item.item.supportingMessages.length > 0 ? (
                  <DetailSection title="Assistant fragments">
                    <div className="space-y-3">
                      {item.item.supportingMessages.map((message) => (
                        <div
                          className="rounded-lg border border-white/10 bg-black/20 p-3"
                          key={message.key}
                        >
                          <ChatMarkdown
                            className="space-y-2 text-slate-100 text-sm leading-6 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                            content={stripAnsi(message.content)}
                          />
                        </div>
                      ))}
                    </div>
                  </DetailSection>
                ) : null}

                {item.item.statuses.length > 0 ? (
                  <DetailSection title="Status">
                    <div className="space-y-2 text-slate-200 text-sm">
                      {item.item.statuses.map((message) => (
                        <div
                          className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                          key={message.key}
                        >
                          {stripAnsi(message.content)}
                        </div>
                      ))}
                    </div>
                  </DetailSection>
                ) : null}

                {item.item.executions.length > 0 ? (
                  <DetailSection title="Tool & plan activity">
                    <div className="space-y-4">
                      {item.item.executions.map((execution) => {
                        const stateMeta = getStateMeta(execution.state);
                        const inputText = getExecutionInputText(execution);

                        return (
                          <div
                            className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4"
                            key={execution.key}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <stateMeta.Icon
                                className={cn(
                                  "h-4 w-4 shrink-0",
                                  execution.state === "running" &&
                                    "animate-spin"
                                )}
                              />
                              <div className="min-w-0 flex-1 text-slate-100 text-sm">
                                {execution.isPlan
                                  ? "Task plan"
                                  : execution.title}
                              </div>
                              <Badge
                                className={stateMeta.badgeClassName}
                                variant="outline"
                              >
                                {stateMeta.label}
                              </Badge>
                            </div>

                            {execution.isPlan && execution.todos.length > 0 ? (
                              <div className="space-y-2 text-slate-200 text-sm">
                                {execution.todos.map((todo) => (
                                  <div
                                    className="flex items-start gap-2"
                                    key={`${execution.key}-${todo.id}`}
                                  >
                                    <span className="mt-0.5 w-4 text-center text-slate-400">
                                      {renderTodoStatus(todo.status)}
                                    </span>
                                    <span className="flex-1">{todo.title}</span>
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            {inputText ? (
                              <DetailSection title="Input">
                                <DetailCodeBlock content={inputText} />
                              </DetailSection>
                            ) : null}

                            {execution.result ? (
                              <DetailSection title="Result">
                                <DetailCodeBlock content={execution.result} />
                              </DetailSection>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </DetailSection>
                ) : null}

                {item.item.lifecycle.length > 0 ? (
                  <DetailSection title="Turn lifecycle">
                    <div className="space-y-2 text-slate-200 text-sm">
                      {item.item.lifecycle.map((entry) => (
                        <div
                          className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                          key={entry.id}
                        >
                          <span>{renderTurnLifecycleLabel(entry.state)}</span>
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {new Date(entry.ts).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </DetailSection>
                ) : null}
              </div>
            ) : executionStateMeta ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <executionStateMeta.Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      item.item.state === "running" && "animate-spin"
                    )}
                  />
                  <div className="min-w-0 flex-1 text-slate-100 text-sm">
                    {item.item.isPlan ? "Task plan" : item.item.title}
                  </div>
                  <Badge
                    className={executionStateMeta.badgeClassName}
                    variant="outline"
                  >
                    {executionStateMeta.label}
                  </Badge>
                </div>

                {item.item.isPlan && item.item.todos.length > 0 ? (
                  <DetailSection title="Plan items">
                    <div className="space-y-2">
                      {item.item.todos.map((todo) => (
                        <div
                          className="flex items-start gap-2 text-sm"
                          key={`${item.item.key}-${todo.id}`}
                        >
                          <span className="mt-0.5 w-4 text-center text-slate-400">
                            {renderTodoStatus(todo.status)}
                          </span>
                          <span className="flex-1 text-slate-100">
                            {todo.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  </DetailSection>
                ) : null}

                {getExecutionInputText(item.item) ? (
                  <DetailSection title="Input">
                    <DetailCodeBlock
                      content={getExecutionInputText(item.item) ?? ""}
                    />
                  </DetailSection>
                ) : null}

                {item.item.result ? (
                  <DetailSection title="Result">
                    <DetailCodeBlock content={item.item.result} />
                  </DetailSection>
                ) : null}
              </div>
            ) : null
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

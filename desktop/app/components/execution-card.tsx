import {
  ArrowUpRight,
  CheckCircle2,
  Circle,
  CircleSlash,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  EXECUTION_PREVIEW_MAX_CHARS,
  EXECUTION_PREVIEW_MAX_TODOS,
  getExecutionInputText,
  hasVerboseExecutionContent,
  truncateText,
  type ChatDetailItem,
} from "@/lib/chat-detail";
import type { ChatTimelineExecutionItem } from "@/lib/chat-timeline";
import { cn } from "@/lib/utils";

function WrapCode({ content }: { content: string }) {
  const [wrap, setWrap] = useState(false);

  return (
    <div className="group relative">
      <button
        className="absolute top-1 right-1 z-10 rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-muted-foreground/70 leading-none opacity-0 transition-opacity hover:bg-white/20 hover:text-foreground/80 group-hover:opacity-100"
        onClick={() => setWrap((value) => !value)}
        type="button"
      >
        {wrap ? "→ scroll" : "↵ wrap"}
      </button>
      <pre
        className={cn(
          "max-w-full rounded bg-black/20 p-2 font-mono text-[11px]",
          wrap
            ? "overflow-x-hidden whitespace-pre-wrap break-words"
            : "overflow-x-auto whitespace-pre"
        )}
      >
        {content}
      </pre>
    </div>
  );
}

function getStateMeta(state: ChatTimelineExecutionItem["state"]): {
  Icon: typeof LoaderCircle;
  className: string;
  label: string;
} {
  if (state === "pending") {
    return {
      Icon: Circle,
      className: "border-slate-500/30 bg-slate-500/10 text-slate-300",
      label: "Pending",
    };
  }
  if (state === "completed") {
    return {
      Icon: CheckCircle2,
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      label: "Done",
    };
  }
  if (state === "failed") {
    return {
      Icon: TriangleAlert,
      className: "border-red-500/30 bg-red-500/10 text-red-300",
      label: "Failed",
    };
  }
  if (state === "interrupted") {
    return {
      Icon: CircleSlash,
      className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      label: "Interrupted",
    };
  }
  return {
    Icon: LoaderCircle,
    className: "border-blue-500/30 bg-blue-500/10 text-blue-300",
    label: "Running",
  };
}

function summarizeInput(input: Record<string, unknown> | null): string | null {
  if (!input) {
    return null;
  }

  const command = input.command ?? input.cmd;
  if (typeof command === "string" && command.trim()) {
    return command;
  }

  const path = input.path ?? input.filePath ?? input.filename;
  if (typeof path === "string" && path.trim()) {
    return path;
  }

  const firstString = Object.values(input).find(
    (value) => typeof value === "string" && value.trim().length > 0
  );
  return typeof firstString === "string" ? firstString : null;
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

interface ExecutionCardProps {
  item: ChatTimelineExecutionItem;
  onOpenDetail?: (item: ChatDetailItem) => void;
}

function ExecutionCard({ item, onOpenDetail }: ExecutionCardProps) {
  const isVerbose = useMemo(() => hasVerboseExecutionContent(item), [item]);
  const [expanded, setExpanded] = useState(
    item.state !== "completed" && !isVerbose
  );
  const prevStateRef = useRef(item.state);
  const { Icon, className, label } = useMemo(
    () => getStateMeta(item.state),
    [item.state]
  );
  const summary = useMemo(() => summarizeInput(item.input), [item.input]);
  const inputText = useMemo(() => getExecutionInputText(item), [item]);
  const timeStr = new Date(item.lastTs).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  useEffect(() => {
    if (isVerbose) {
      setExpanded(false);
      prevStateRef.current = item.state;
      return;
    }

    if (prevStateRef.current !== "completed" && item.state === "completed") {
      setExpanded(false);
    }
    prevStateRef.current = item.state;
  }, [isVerbose, item.state]);

  const handlePrimaryAction = () => {
    if (isVerbose && onOpenDetail) {
      onOpenDetail({ type: "execution", item });
      return;
    }
    setExpanded((value) => !value);
  };

  return (
    <div className="space-y-1 rounded-md border border-border/40 bg-white/5 px-3 py-2">
      <button
        className="flex w-full items-start gap-2 text-left"
        onClick={handlePrimaryAction}
        type="button"
      >
        <Icon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            item.state === "running" && "animate-spin"
          )}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-foreground/90 text-xs">
              {item.isPlan ? "Task Plan" : item.title}
            </span>
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px]",
                className
              )}
            >
              {label}
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {timeStr}
            </span>
          </div>
          {summary && (
            <div className="truncate text-[11px] text-muted-foreground/80">
              {summary}
            </div>
          )}
        </div>
      </button>

      {isVerbose ? (
        <div className="space-y-2 border-border/20 border-t pt-2">
          {item.isPlan && item.todos.length > 0 ? (
            <div className="space-y-1.5">
              {item.todos.slice(0, EXECUTION_PREVIEW_MAX_TODOS).map((todo) => (
                <div
                  className="flex items-start gap-2 text-xs"
                  key={`${item.key}-${todo.id}`}
                >
                  <span className="mt-0.5 w-3 text-center text-muted-foreground/80">
                    {renderTodoStatus(todo.status)}
                  </span>
                  <span className="flex-1 text-foreground/90">
                    {todo.title}
                  </span>
                </div>
              ))}
              {item.todos.length > EXECUTION_PREVIEW_MAX_TODOS && (
                <div className="text-[11px] text-muted-foreground/70">
                  +{item.todos.length - EXECUTION_PREVIEW_MAX_TODOS} more plan items in detail
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {inputText && (
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.12em]">
                    Input preview
                  </div>
                  <pre className="max-h-24 overflow-hidden rounded bg-black/20 p-2 font-mono text-[11px] whitespace-pre-wrap break-words text-foreground/85">
                    {truncateText(inputText, EXECUTION_PREVIEW_MAX_CHARS)}
                  </pre>
                </div>
              )}
              {item.result && (
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.12em]">
                    Result preview
                  </div>
                  <pre className="max-h-24 overflow-hidden rounded bg-black/20 p-2 font-mono text-[11px] whitespace-pre-wrap break-words text-foreground/85">
                    {truncateText(item.result, EXECUTION_PREVIEW_MAX_CHARS)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {onOpenDetail && (
            <button
              className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => onOpenDetail({ type: "execution", item })}
              type="button"
            >
              <ArrowUpRight className="h-3 w-3" />
              Open detail
            </button>
          )}
        </div>
      ) : expanded ? (
        <div className="space-y-2 border-border/20 border-t pt-2">
          {item.isPlan && item.todos.length > 0 ? (
            <div className="space-y-1.5">
              {item.todos.map((todo) => (
                <div
                  className="flex items-start gap-2 text-xs"
                  key={`${item.key}-${todo.id}`}
                >
                  <span className="mt-0.5 w-3 text-center text-muted-foreground/80">
                    {renderTodoStatus(todo.status)}
                  </span>
                  <span className="flex-1 text-foreground/90">
                    {todo.title}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            item.input && (
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.12em]">
                  Input
                </div>
                <WrapCode content={JSON.stringify(item.input, null, 2)} />
              </div>
            )
          )}

          {item.result && (
            <div className="space-y-1">
              <div className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.12em]">
                Result
              </div>
              <WrapCode content={item.result} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default memo(ExecutionCard);

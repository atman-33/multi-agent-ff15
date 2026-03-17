import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleSlash,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import { type ChatDetailItem, getExecutionInputText } from "@/lib/chat-detail";
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

function summarizeResult(result: string | null): string | null {
  if (!result) {
    return null;
  }

  const firstMeaningfulLine = result
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstMeaningfulLine ?? null;
}

function truncateInline(value: string, maxChars = 140): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars).trimEnd()}...`;
}

function summarizeExecution(item: ChatTimelineExecutionItem): string | null {
  if (item.isPlan && item.todos.length > 0) {
    const firstTodo = item.todos[0]?.title?.trim();
    if (firstTodo) {
      return truncateInline(`${item.todos.length} items · ${firstTodo}`);
    }
    return `${item.todos.length} plan items`;
  }

  const inputSummary = summarizeInput(item.input);
  const resultSummary = summarizeResult(item.result);

  if (inputSummary && resultSummary) {
    return truncateInline(`${inputSummary} · ${resultSummary}`);
  }

  if (inputSummary) {
    return truncateInline(inputSummary);
  }

  if (resultSummary) {
    return truncateInline(resultSummary);
  }

  return null;
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
  const [expanded, setExpanded] = useState(false);
  const { Icon, className, label } = useMemo(
    () => getStateMeta(item.state),
    [item.state]
  );
  const summary = useMemo(() => summarizeExecution(item), [item]);
  const inputText = useMemo(() => getExecutionInputText(item), [item]);
  const timeStr = new Date(item.lastTs).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const handlePrimaryAction = () => {
    setExpanded((value) => !value);
  };

  return (
    <div className="group/execution">
      <div className="space-y-1 rounded-md border border-border/40 bg-white/5 px-3 py-2">
        <button
          aria-expanded={expanded}
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
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
              )}
            </div>
            {summary && (
              <div className="truncate text-[11px] text-muted-foreground/80">
                {summary}
              </div>
            )}
          </div>
        </button>

        {expanded ? (
          <div className="space-y-2 border-border/20 border-t pt-2">
            {item.isPlan && item.todos.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.12em]">
                  Plan
                </div>
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
            ) : null}

            {inputText ? (
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.12em]">
                  Input
                </div>
                <WrapCode content={inputText} />
              </div>
            ) : null}

            {item.result ? (
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.12em]">
                  Result
                </div>
                <WrapCode content={item.result} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {onOpenDetail ? (
        <div
          className={cn(
            "mt-1 flex justify-start transition-opacity",
            expanded
              ? "opacity-100"
              : "opacity-0 group-hover/execution:opacity-100"
          )}
        >
          <button
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            onClick={() => onOpenDetail({ type: "execution", item })}
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

export default memo(ExecutionCard);

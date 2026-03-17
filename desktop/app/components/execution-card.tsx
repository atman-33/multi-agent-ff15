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

function normalizeTodoStatus(
  status: string
): "completed" | "in_progress" | "pending" {
  if (status === "completed") {
    return "completed";
  }
  if (status === "in-progress" || status === "in_progress") {
    return "in_progress";
  }
  return "pending";
}

function getPlanCounts(todos: ChatTimelineExecutionItem["todos"]): {
  completed: number;
  inProgress: number;
  pending: number;
  total: number;
} {
  return todos.reduce(
    (counts, todo) => {
      const normalizedStatus = normalizeTodoStatus(todo.status);
      if (normalizedStatus === "completed") {
        counts.completed += 1;
      } else if (normalizedStatus === "in_progress") {
        counts.inProgress += 1;
      } else {
        counts.pending += 1;
      }
      counts.total += 1;
      return counts;
    },
    { completed: 0, inProgress: 0, pending: 0, total: 0 }
  );
}

function getPlanSummaryText(
  item: ChatTimelineExecutionItem,
  activeTodoLabel: string | null,
  total: number
): string {
  if (total > 0) {
    return activeTodoLabel ?? `${total} plan items`;
  }

  const inputSummary = summarizeInput(item.input);
  if (inputSummary) {
    return truncateInline(`Plan updating · ${inputSummary}`, 120);
  }

  return "Plan updating...";
}

function getActiveTodoLabel(
  todos: ChatTimelineExecutionItem["todos"]
): string | null {
  const inProgressTodo = todos.find(
    (todo) => normalizeTodoStatus(todo.status) === "in_progress"
  );
  if (inProgressTodo) {
    return `In progress · ${truncateInline(inProgressTodo.title, 110)}`;
  }

  const nextPendingTodo = todos.find(
    (todo) => normalizeTodoStatus(todo.status) === "pending"
  );
  if (nextPendingTodo) {
    return `Next · ${truncateInline(nextPendingTodo.title, 110)}`;
  }

  return todos.length > 0 ? "All tasks complete" : null;
}

function getTodoTextClassName(status: string): string {
  const normalizedStatus = normalizeTodoStatus(status);
  if (normalizedStatus === "completed") {
    return "text-foreground/55 line-through";
  }
  if (normalizedStatus === "in_progress") {
    return "font-medium text-foreground";
  }
  return "text-foreground/90";
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
  defaultExpanded?: boolean;
  item: ChatTimelineExecutionItem;
  onOpenDetail?: (item: ChatDetailItem) => void;
}

function ExecutionCard({
  defaultExpanded = false,
  item,
  onOpenDetail,
}: ExecutionCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { Icon, className, label } = useMemo(
    () => getStateMeta(item.state),
    [item.state]
  );
  const summary = useMemo(
    () => (item.isPlan ? null : summarizeExecution(item)),
    [item]
  );
  const planCounts = useMemo(() => getPlanCounts(item.todos), [item.todos]);
  const activeTodoLabel = useMemo(
    () => getActiveTodoLabel(item.todos),
    [item.todos]
  );
  const inputText = useMemo(() => getExecutionInputText(item), [item]);
  const planSummaryText = useMemo(
    () => getPlanSummaryText(item, activeTodoLabel, planCounts.total),
    [activeTodoLabel, item, planCounts.total]
  );
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
          className={cn(
            "flex w-full items-start gap-2 text-left",
            item.isPlan && !expanded && "items-center"
          )}
          onClick={handlePrimaryAction}
          type="button"
        >
          <Icon
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0",
              item.state === "running" && "animate-spin"
            )}
          />
          <div
            className={cn(
              "min-w-0 flex-1 space-y-1",
              item.isPlan && !expanded && "space-y-0"
            )}
          >
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

            {item.isPlan ? (
              expanded ? (
                <div className="space-y-1 pt-0.5">
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/85">
                    {planCounts.total > 0 ? (
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                        {planCounts.completed}/{planCounts.total} done
                      </span>
                    ) : (
                      <span className="rounded-full border border-slate-500/20 bg-slate-500/10 px-2 py-0.5 text-slate-300">
                        Updating plan
                      </span>
                    )}
                    {planCounts.total > 0 && planCounts.inProgress > 0 ? (
                      <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-blue-300">
                        {planCounts.inProgress} active
                      </span>
                    ) : null}
                    {planCounts.total > 0 && planCounts.pending > 0 ? (
                      <span className="rounded-full border border-slate-500/20 bg-slate-500/10 px-2 py-0.5 text-slate-300">
                        {planCounts.pending} pending
                      </span>
                    ) : null}
                  </div>

                  {planSummaryText ? (
                    <div className="truncate text-[11px] text-muted-foreground/80">
                      {planSummaryText}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-[10px] text-muted-foreground/85">
                  {planCounts.total > 0 ? (
                    <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                      {planCounts.completed}/{planCounts.total}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-slate-500/20 bg-slate-500/10 px-2 py-0.5 text-slate-300">
                      Updating
                    </span>
                  )}

                  {planCounts.total > 0 && planCounts.inProgress > 0 ? (
                    <span className="shrink-0 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-blue-300">
                      {planCounts.inProgress} active
                    </span>
                  ) : null}

                  <span className="min-w-0 truncate text-[11px] text-muted-foreground/75">
                    {planSummaryText}
                  </span>
                </div>
              )
            ) : null}
          </div>
        </button>

        {expanded ? (
          <div className="space-y-2 border-border/20 border-t pt-2">
            {item.isPlan && item.todos.length > 0 ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/85">
                  {planCounts.total > 0 ? (
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                      {planCounts.completed}/{planCounts.total} completed
                    </span>
                  ) : (
                    <span className="rounded-full border border-slate-500/20 bg-slate-500/10 px-2 py-0.5 text-slate-300">
                      Updating plan
                    </span>
                  )}
                  {planCounts.total > 0 && planCounts.inProgress > 0 ? (
                    <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-blue-300">
                      {planCounts.inProgress} in progress
                    </span>
                  ) : null}
                  {planCounts.total > 0 && planCounts.pending > 0 ? (
                    <span className="rounded-full border border-slate-500/20 bg-slate-500/10 px-2 py-0.5 text-slate-300">
                      {planCounts.pending} pending
                    </span>
                  ) : null}
                </div>

                <div className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.12em]">
                  Plan
                </div>
                {item.todos.map((todo) => (
                  <div
                    className="flex items-start gap-2 rounded-md border border-border/30 bg-black/10 px-2 py-1.5 text-xs"
                    key={`${item.key}-${todo.id}`}
                  >
                    <span
                      className={cn(
                        "mt-0.5 w-3 text-center",
                        normalizeTodoStatus(todo.status) === "completed"
                          ? "text-emerald-300"
                          : normalizeTodoStatus(todo.status) === "in_progress"
                            ? "text-blue-300"
                            : "text-muted-foreground/80"
                      )}
                    >
                      {renderTodoStatus(todo.status)}
                    </span>
                    <span
                      className={cn(
                        "flex-1",
                        getTodoTextClassName(todo.status)
                      )}
                    >
                      {todo.title}
                    </span>
                  </div>
                ))}
              </div>
            ) : item.isPlan ? (
              <div className="rounded-md border border-border/30 bg-black/10 px-2.5 py-2 text-[11px] text-muted-foreground/80">
                No plan items available yet.
              </div>
            ) : null}

            {!item.isPlan && inputText ? (
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.12em]">
                  Input
                </div>
                <WrapCode content={inputText} />
              </div>
            ) : null}

            {!item.isPlan && item.result ? (
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

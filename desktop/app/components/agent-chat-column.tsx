import { invoke } from "@tauri-apps/api/core";
import {
  ChevronDown,
  ChevronUp,
  Crown,
  FolderGit2,
  GitBranch,
  MessageSquarePlus,
  Moon,
  Settings2,
  Square,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import ChatDetailSheet from "@/components/chat-detail-sheet";
import ExecutionCard from "@/components/execution-card";
import MessageCard from "@/components/message-card";
import MessageComposer from "@/components/message-composer";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ALL_MODEL_SWITCH_AGENTS,
  type ModelSwitchAgent,
} from "@/constants/agents";
import {
  COMRADE_CONFIG,
  COMRADES,
  type ComradeId,
} from "@/constants/comrade-config";
import { useActiveProjects } from "@/hooks/use-active-projects";
import { useAgentActivity } from "@/hooks/use-agent-activity";
import type { AgentId } from "@/hooks/use-agent-chat-log";
import type { InboxLogRecord } from "@/hooks/use-inbox-log";
import { useSessionHistorySelection } from "@/hooks/use-session-history-selection";
import type { ChatDetailItem } from "@/lib/chat-detail";
import {
  buildChatTimeline,
  type ChatLogRecord,
  type ChatTimelineExecutionItem,
  type ChatTimelineItem,
} from "@/lib/chat-timeline";
import {
  getProjectScopeForAgent,
  PROJECT_SCOPE_LABELS,
} from "@/lib/project-scopes";
import {
  filterChatLogRecordsBySession,
  getSessionHistoryFallbackLabel,
  getSessionHistoryPrimaryLabel,
  getSessionHistoryRelativeTimeLabel,
  type SessionHistorySummary,
} from "@/lib/session-history";
import { cn } from "@/lib/utils";

interface AgentChatColumnProps {
  agent: "noctis" | "lunafreya";
  busyMap?: Record<ComradeId, string>;
  contextPercent?: number | null;
  inboxMessages: InboxLogRecord[];
  isTauri?: boolean;
  modelOptions?: string[];
  modelRefreshTrigger?: number;
  modeSwitchTrigger?: number;
  onPartyViewChange?: (view: ComradeId | null) => void;
  onSent?: (agent: AgentId, content: string, id?: string) => void;
  optimisticMessages?: InboxLogRecord[];
  partyInboxMessages?: Partial<Record<ComradeId, InboxLogRecord[]>>;
  partyRecords?: Partial<Record<ComradeId, ChatLogRecord[]>>;
  partySessionSummaries?: Partial<Record<ComradeId, SessionHistorySummary[]>>;
  /** Party props — only used when agent === "noctis" */
  partyView?: ComradeId | null;
  records: ChatLogRecord[];
  sessionHistoryReady?: boolean;
  sessionSummaries?: SessionHistorySummary[];
  status?: string;
}

interface ProjectStatusChipProps {
  activeProjectIds: string[];
  loading: boolean;
  projectById: Record<
    string,
    { branchName?: string | null; displayName: string; path: string }
  >;
  scopeLabel: string;
}

const AGENT_CONFIG = {
  noctis: {
    label: "Noctis",
    Icon: Crown,
    shortcut: "Ctrl+1",
    imageSrc: "/images/noctis.png",
    theme: {
      // Jet black + deep indigo (blue-violet)
      border: "border-indigo-700/40",
      bg: "bg-indigo-950/10",
      headerBorder: "border-indigo-700/30",
      headerBg: "bg-indigo-950/20",
      text: "text-indigo-300",
      separator: "from-indigo-700/0 via-indigo-700/50 to-indigo-700/0",
    },
  },
  lunafreya: {
    label: "Lunafreya",
    Icon: Moon,
    shortcut: "Ctrl+2",
    imageSrc: "/images/lunafreya.png",
    theme: {
      // Pure white + pale silver
      border: "border-slate-300/30",
      bg: "bg-white/[0.03]",
      headerBorder: "border-slate-300/20",
      headerBg: "bg-white/[0.06]",
      text: "text-slate-200",
      separator: "from-slate-300/0 via-slate-300/40 to-slate-300/0",
    },
  },
} as const;

/** Per-comrade colour themes matching FF15 character motifs. */
const COMRADE_THEME = {
  // Ignis — calm intellect: dark navy / charcoal
  ignis: {
    selected: "bg-zinc-800/20 text-zinc-300",
    ping: "bg-zinc-400/10",
    processingBorder: "border-zinc-400/70",
    processingGlow: "shadow-[0_0_6px_rgba(161,161,170,0.4)]",
    columnTheme: {
      border: "border-zinc-600/40",
      bg: "bg-zinc-900/10",
      headerBorder: "border-zinc-600/30",
      headerBg: "bg-zinc-900/20",
      text: "text-zinc-300",
      separator: "from-zinc-600/0 via-zinc-600/50 to-zinc-600/0",
      processingPing: "bg-zinc-400/30",
      processingGlow: "drop-shadow-[0_0_6px_rgba(161,161,170,0.6)]",
    },
  },
  // Gladiolus — guardian, earth, strength: deep green / emerald
  gladiolus: {
    selected: "bg-emerald-900/20 text-emerald-400",
    ping: "bg-emerald-500/10",
    processingBorder: "border-emerald-500/70",
    processingGlow: "shadow-[0_0_6px_rgba(52,211,153,0.4)]",
    columnTheme: {
      border: "border-emerald-800/40",
      bg: "bg-emerald-950/10",
      headerBorder: "border-emerald-800/30",
      headerBg: "bg-emerald-950/20",
      text: "text-emerald-400",
      separator: "from-emerald-800/0 via-emerald-800/50 to-emerald-800/0",
      processingPing: "bg-emerald-400/30",
      processingGlow: "drop-shadow-[0_0_6px_rgba(52,211,153,0.6)]",
    },
  },
  // Prompto — mood maker, light, positive energy: sun yellow / light orange
  prompto: {
    selected: "bg-amber-900/20 text-amber-300",
    ping: "bg-amber-400/10",
    processingBorder: "border-amber-400/70",
    processingGlow: "shadow-[0_0_6px_rgba(251,191,36,0.4)]",
    columnTheme: {
      border: "border-amber-500/40",
      bg: "bg-amber-950/10",
      headerBorder: "border-amber-500/30",
      headerBg: "bg-amber-950/20",
      text: "text-amber-300",
      separator: "from-amber-500/0 via-amber-500/50 to-amber-500/0",
      processingPing: "bg-amber-300/30",
      processingGlow: "drop-shadow-[0_0_6px_rgba(252,211,77,0.6)]",
    },
  },
  // Iris — pale pink / light coral
  iris: {
    selected: "bg-rose-800/20 text-rose-300",
    ping: "bg-rose-400/10",
    processingBorder: "border-rose-400/70",
    processingGlow: "shadow-[0_0_6px_rgba(251,113,133,0.4)]",
    columnTheme: {
      border: "border-rose-500/40",
      bg: "bg-rose-950/10",
      headerBorder: "border-rose-500/30",
      headerBg: "bg-rose-950/20",
      text: "text-rose-300",
      separator: "from-rose-500/0 via-rose-500/50 to-rose-500/0",
      processingPing: "bg-rose-300/30",
      processingGlow: "drop-shadow-[0_0_6px_rgba(251,113,133,0.6)]",
    },
  },
} as const;

function ProjectStatusChip({
  activeProjectIds,
  projectById,
  scopeLabel,
  loading,
}: ProjectStatusChipProps) {
  const firstProject = activeProjectIds[0]
    ? projectById[activeProjectIds[0]]
    : null;
  const firstProjectLabel =
    firstProject?.displayName ?? activeProjectIds[0] ?? "No project";
  const extraCount = Math.max(activeProjectIds.length - 1, 0);

  return (
    <HoverCard closeDelay={120} openDelay={150}>
      <HoverCardTrigger asChild>
        <Link
          aria-label={`Open ${scopeLabel} projects`}
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-full border px-2.5 py-1 transition-all duration-200",
            "border-amber-500/30 bg-amber-500/10 text-amber-100 hover:border-amber-400/50 hover:bg-amber-500/15"
          )}
          title={`${scopeLabel} projects`}
          to="/projects"
        >
          <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          {loading ? (
            <span className="truncate text-[10px] text-amber-100/80">
              Loading...
            </span>
          ) : activeProjectIds.length === 0 ? (
            <span className="truncate font-medium text-[10px] text-amber-100/85">
              No project
            </span>
          ) : (
            <>
              <span className="truncate font-semibold text-[10px] text-amber-50">
                {firstProjectLabel}
              </span>
              {firstProject?.branchName && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-950/70 px-1.5 py-0.5 font-mono text-[9px] text-amber-300">
                  <GitBranch className="h-2.5 w-2.5" />
                  {firstProject.branchName}
                </span>
              )}
              {extraCount > 0 && (
                <span className="shrink-0 rounded-full bg-amber-300 px-1.5 py-0.5 font-black text-[9px] text-amber-950">
                  +{extraCount}
                </span>
              )}
            </>
          )}
          <Settings2 className="h-3 w-3 shrink-0 text-amber-200/70" />
        </Link>
      </HoverCardTrigger>
      <HoverCardContent
        align="end"
        className="w-80 overflow-hidden border-amber-500/20 bg-card/95 p-0 backdrop-blur-md"
      >
        <div className="border-border/50 border-b bg-amber-500/5 px-4 py-3">
          <h4 className="flex items-center gap-2 font-bold text-amber-500/85 text-xs uppercase tracking-widest">
            <FolderGit2 className="h-3 w-3" />
            {scopeLabel}
          </h4>
        </div>
        <div className="max-h-[300px] overflow-y-auto py-1">
          {!loading && activeProjectIds.length === 0 && (
            <div className="px-4 py-3 text-muted-foreground text-sm">
              No active project
            </div>
          )}
          {loading && (
            <div className="px-4 py-3 text-muted-foreground text-sm">
              Loading...
            </div>
          )}
          {activeProjectIds.map((id) => {
            const project = projectById[id];
            return (
              <div
                className="group flex flex-col gap-0.5 px-4 py-2 transition-colors hover:bg-amber-500/10"
                key={id}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-foreground/90 text-sm transition-colors group-hover:text-amber-500">
                    {project?.displayName ?? id}
                  </span>
                  {project?.branchName && (
                    <span className="inline-flex items-center gap-1 rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] text-amber-500/80">
                      <GitBranch className="h-2.5 w-2.5" />
                      {project.branchName}
                    </span>
                  )}
                </div>
                <span className="truncate font-mono text-[10px] text-muted-foreground opacity-60">
                  {project?.path ?? "Unknown path"}
                </span>
              </div>
            );
          })}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

type MergedItem =
  | { type: "agent"; item: ChatTimelineItem; ts: string }
  | { type: "inbox"; msg: InboxLogRecord; ts: string };

type VirtualTimelineRow =
  | { kind: "merged"; key: string; mergedItem: MergedItem }
  | { agentLabel: string; key: string; kind: "pending" };

interface VirtualRowLayout {
  end: number;
  height: number;
  key: string;
  row: VirtualTimelineRow;
  start: number;
}

const ROW_OVERSCAN_PX = 480;

function getEstimatedRowHeight(row: VirtualTimelineRow): number {
  if (row.kind === "pending") {
    return 48;
  }

  if (row.mergedItem.type === "inbox") {
    return 88;
  }

  if (row.mergedItem.item.type === "execution") {
    return row.mergedItem.item.isPlan ? 108 : 120;
  }

  return 140;
}

function buildVirtualRowLayouts(
  rows: VirtualTimelineRow[],
  measuredHeights: Map<string, number>
): { layouts: VirtualRowLayout[]; totalHeight: number } {
  let offset = 0;
  const layouts = rows.map((row) => {
    const height = measuredHeights.get(row.key) ?? getEstimatedRowHeight(row);
    const layout = {
      end: offset + height,
      height,
      key: row.key,
      row,
      start: offset,
    } satisfies VirtualRowLayout;
    offset += height;
    return layout;
  });

  return { layouts, totalHeight: offset };
}

function getVisibleVirtualRows(
  layouts: VirtualRowLayout[],
  scrollTop: number,
  viewportHeight: number
): {
  bottomSpacer: number;
  topSpacer: number;
  visibleLayouts: VirtualRowLayout[];
} {
  const visibleTop = Math.max(scrollTop - ROW_OVERSCAN_PX, 0);
  const visibleBottom = scrollTop + viewportHeight + ROW_OVERSCAN_PX;
  const visibleLayouts = layouts.filter(
    (layout) => layout.end >= visibleTop && layout.start <= visibleBottom
  );

  if (visibleLayouts.length === 0) {
    return { bottomSpacer: 0, topSpacer: 0, visibleLayouts: [] };
  }

  const first = visibleLayouts[0];
  const last = visibleLayouts.at(-1);
  const totalHeight = layouts.at(-1)?.end ?? 0;

  if (!last) {
    return { bottomSpacer: 0, topSpacer: 0, visibleLayouts: [] };
  }

  return {
    bottomSpacer: Math.max(totalHeight - last.end, 0),
    topSpacer: first.start,
    visibleLayouts,
  };
}

function getDomMaxScrollTop(element: HTMLDivElement): number {
  return Math.max(element.scrollHeight - element.clientHeight, 0);
}

const VirtualizedTimelineRow = memo(function VirtualizedTimelineRow({
  activeLabel,
  layout,
  onHeightChange,
  onOpenDetail,
}: {
  activeLabel: string;
  layout: VirtualRowLayout;
  onHeightChange: (key: string, height: number) => void;
  onOpenDetail: (item: ChatDetailItem) => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = rowRef.current;
    if (!node) {
      return;
    }

    const measure = () => {
      onHeightChange(layout.key, node.getBoundingClientRect().height);
    };

    measure();

    const observer = new ResizeObserver(() => measure());
    observer.observe(node);
    return () => observer.disconnect();
  }, [layout.key, onHeightChange]);

  return (
    <div ref={rowRef}>
      {layout.row.kind === "pending" ? (
        <div className="pb-3">
          <PendingIndicator agentLabel={layout.row.agentLabel} />
        </div>
      ) : layout.row.mergedItem.type === "inbox" ? (
        <div className="pb-3">
          <InboxBubble msg={layout.row.mergedItem.msg} />
        </div>
      ) : (
        <div className="flex flex-col items-start gap-0.5 pb-3">
          <span className="ml-1 font-semibold text-[10px] text-muted-foreground/60">
            {activeLabel}
          </span>
          <div className="w-full">
            {layout.row.mergedItem.item.type === "message" ? (
              <MessageCard
                onOpenDetail={onOpenDetail}
                record={layout.row.mergedItem.item}
              />
            ) : (
              <ExecutionCard
                item={layout.row.mergedItem.item}
                onOpenDetail={onOpenDetail}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
});

function sortMergedTimeline(left: MergedItem, right: MergedItem): number {
  const diff = new Date(left.ts).getTime() - new Date(right.ts).getTime();
  if (diff !== 0) {
    return diff;
  }

  const leftStableId = left.type === "inbox" ? left.msg.id : left.item.key;
  const rightStableId = right.type === "inbox" ? right.msg.id : right.item.key;
  return leftStableId.localeCompare(rightStableId);
}

/** Merge agent records and inbox messages by UTC timestamp (pure sort) with optimistic deduplication. */
function mergeTimeline(
  items: ChatTimelineItem[],
  inboxMessages: InboxLogRecord[],
  optimisticMessages: InboxLogRecord[] = []
): MergedItem[] {
  const realIds = new Set(inboxMessages.map((m) => m.id));
  const filteredOptimistic = optimisticMessages.filter(
    (m) => !realIds.has(m.id)
  );

  return [
    ...items.map((item) => ({
      type: "agent" as const,
      item,
      ts: item.firstTs,
    })),
    ...inboxMessages.map((m) => ({ type: "inbox" as const, msg: m, ts: m.ts })),
    ...filteredOptimistic.map((m) => ({
      type: "inbox" as const,
      msg: m,
      ts: m.ts,
    })),
  ].sort(sortMergedTimeline);
}

function getCurrentPlanItem(
  items: ChatTimelineItem[]
): ChatTimelineExecutionItem | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.type === "execution" && item.isPlan) {
      return item;
    }
  }

  return null;
}

function normalizePlanStatus(
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

function getPlanMetrics(item: ChatTimelineExecutionItem): {
  completed: number;
  inProgress: number;
  left: number;
  total: number;
} {
  const totals = item.todos.reduce(
    (counts, todo) => {
      const status = normalizePlanStatus(todo.status);
      if (status === "completed") {
        counts.completed += 1;
      } else if (status === "in_progress") {
        counts.inProgress += 1;
      }

      counts.total += 1;
      return counts;
    },
    { completed: 0, inProgress: 0, left: 0, total: 0 }
  );

  return {
    ...totals,
    left: Math.max(totals.total - totals.completed, 0),
  };
}

function getCurrentPlanHeadline(item: ChatTimelineExecutionItem): string {
  const inProgressTodo = item.todos.find(
    (todo) => normalizePlanStatus(todo.status) === "in_progress"
  );
  if (inProgressTodo?.title) {
    return `In progress · ${inProgressTodo.title}`;
  }

  const nextTodo = item.todos.find(
    (todo) => normalizePlanStatus(todo.status) === "pending"
  );
  if (nextTodo?.title) {
    return `Next · ${nextTodo.title}`;
  }

  if (item.todos.length > 0) {
    return "All tasks complete";
  }

  return "Plan updating...";
}

function renderPlanStatusGlyph(status: string): string {
  const normalizedStatus = normalizePlanStatus(status);
  if (normalizedStatus === "completed") {
    return "✓";
  }
  if (normalizedStatus === "in_progress") {
    return "•";
  }
  return "○";
}

/** Code block with wrap/scroll toggle button (appears on hover). */
function CodeBlock({ children }: { children: React.ReactNode }) {
  const [wrap, setWrap] = useState(false);
  return (
    <div className="group relative my-1">
      <button
        className="absolute top-1 right-1 z-10 rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-muted-foreground/70 leading-none opacity-0 transition-opacity hover:bg-white/20 hover:text-foreground/80 group-hover:opacity-100"
        onClick={() => setWrap((v) => !v)}
        title={wrap ? "Switch to scroll mode" : "Switch to wrap mode"}
        type="button"
      >
        {wrap ? "→ scroll" : "↵ wrap"}
      </button>
      <pre
        className={cn(
          "min-w-0 max-w-full rounded bg-black/20 p-1.5 text-[11px]",
          wrap
            ? "overflow-x-hidden [&_code]:overflow-x-hidden [&_code]:whitespace-pre-wrap [&_code]:break-words"
            : "overflow-x-auto [&_code]:overflow-x-auto [&_code]:whitespace-pre"
        )}
      >
        {children}
      </pre>
    </div>
  );
}

/** Inbox message bubble — Crystal (right-aligned primary) or agent (left-aligned neutral). */
const InboxBubble = memo(function InboxBubble({
  msg,
}: {
  msg: InboxLogRecord;
}) {
  const ts = new Date(msg.ts);
  const timeStr = ts.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
  const isCrystal = msg.from === "crystal";
  const fromLabel = msg.from.charAt(0).toUpperCase() + msg.from.slice(1);
  // Normalize escaped "\n" (two chars) to real newlines for proper Markdown rendering
  const content = msg.content.replace(/\\n/g, "\n");

  // Stable reference — prevents CodeBlock from unmounting on every 3s poll re-render
  const mdComponents = useMemo<Components>(
    () => ({
      img: () => null,
      a: ({ href, children }) => (
        <a
          className="text-blue-400 underline hover:text-blue-300"
          href={href}
          rel="noopener noreferrer"
          target="_blank"
        >
          {children}
        </a>
      ),
      code: ({ children }) => (
        <code className="rounded bg-black/30 px-1 font-mono text-[11px]">
          {children}
        </code>
      ),
      pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
    }),
    []
  );

  if (isCrystal) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/50">
            {timeStr}
          </span>
          <span className="font-semibold text-[10px] text-primary/80">
            Crystal
          </span>
        </div>
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm border border-primary/30 bg-primary/20 px-3 py-2 text-foreground/90 text-xs leading-relaxed shadow-sm">
          <ReactMarkdown
            className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
            components={mdComponents}
            remarkPlugins={[remarkGfm, remarkBreaks]}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className="font-semibold text-[10px] text-slate-400/80">
          {fromLabel}
        </span>
        <span className="text-[10px] text-muted-foreground/50">{timeStr}</span>
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm border border-slate-500/25 bg-slate-500/10 px-3 py-2 text-foreground/85 text-xs leading-relaxed shadow-sm">
        <ReactMarkdown
          className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          components={mdComponents}
          remarkPlugins={[remarkGfm, remarkBreaks]}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
});

function PendingIndicator({ agentLabel }: { agentLabel: string }) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[10px] text-muted-foreground/50">{agentLabel}</span>
      <div className="rounded-2xl rounded-tl-sm border border-border/20 bg-white/[0.04] px-3 py-2">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              className="block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
              key={i}
              style={{
                animationDelay: `${i * 0.15}s`,
                animationDuration: "0.9s",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ContextBadge({ value }: { value: number | null }) {
  const display = value === null ? "-" : `${value}`;
  const colorClass =
    value === null
      ? "text-muted-foreground/50 border-border/30 bg-white/5"
      : value >= 80
        ? "text-red-400 border-red-500/30 bg-red-500/10"
        : value >= 50
          ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
          : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] tabular-nums leading-none",
              colorClass
            )}
          >
            {display}%
          </span>
        </TooltipTrigger>
        <TooltipContent className="px-2 py-1 text-[11px]" side="bottom">
          Context usage
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ModelSwitchBar({
  targetAgent,
  modelOptions,
  isTauri,
  contextPercent,
  modeSwitchTrigger,
  modelRefreshTrigger,
}: {
  targetAgent: ModelSwitchAgent;
  modelOptions: string[];
  isTauri: boolean;
  contextPercent?: number | null;
  modeSwitchTrigger?: number;
  modelRefreshTrigger?: number;
}) {
  const [modelLabel, setModelLabel] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);
  const [isAborting, setIsAborting] = useState(false);

  const sortedModelOptions = useMemo(
    () => [...modelOptions].sort((a, b) => a.localeCompare(b)),
    [modelOptions]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: modeSwitchTrigger and modelRefreshTrigger are intentional triggers
  useEffect(() => {
    let cancelled = false;
    const fetchModel = async () => {
      if (isTauri) {
        return; // Currently omitted for Tauri
      }
      if (modelOptions.length === 0) {
        return;
      }

      try {
        const res = await fetch(`/api/current-model?agent=${targetAgent}`);
        if (!res.ok) {
          // On error, clear any previously set label so "Unknown" placeholder is shown
          if (!cancelled) {
            setModelLabel("");
          }
          return;
        }
        const data = (await res.json()) as { model?: string };
        const { model } = data;
        if (cancelled) {
          return;
        }
        if (!model) {
          // model not found — show "Unknown" placeholder
          setModelLabel("");
          return;
        }

        // Try to match the returned model name (e.g. "Claude Sonnet 4") with options (e.g. "Claude Sonnet 4.6")
        // Check contains in both directions
        const exactOpt = modelOptions.find(
          (opt) =>
            opt.toLowerCase() === model.toLowerCase() ||
            opt.toLowerCase().includes(model.toLowerCase()) ||
            model.toLowerCase().includes(opt.toLowerCase())
        );
        setModelLabel(exactOpt ?? model);
      } catch (_e) {
        // On unexpected error, clear label so "Unknown" placeholder is shown
        if (!cancelled) {
          setModelLabel("");
        }
      }
    };
    fetchModel();
    return () => {
      cancelled = true;
    };
  }, [
    targetAgent,
    modelOptions,
    isTauri,
    modeSwitchTrigger,
    modelRefreshTrigger,
  ]);

  const applySwitch = useCallback(
    async (newModel: string) => {
      if (!newModel) {
        return;
      }
      setIsSwitching(true);
      const prevModel = modelLabel;
      setModelLabel(newModel); // Optimistic UI update

      try {
        if (isTauri) {
          await invoke("switch_agent_model", {
            agent: targetAgent,
            label: newModel,
          });
        } else {
          const res = await fetch("/api/model-switch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agent: targetAgent, label: newModel }),
          });
          if (!res.ok) {
            const data = (await res.json()) as { error?: string };
            throw new Error(data.error ?? `HTTP ${res.status}`);
          }
        }
        toast.success(`Switched ${targetAgent} to ${newModel}`);
        window.dispatchEvent(
          new CustomEvent("agent-model-switched", {
            detail: { agent: targetAgent, model: newModel },
          })
        );
      } catch (_e) {
        toast.error(`Model switch failed: ${String(_e)}`);
        setModelLabel(prevModel); // Revert on failure
      } finally {
        setIsSwitching(false);
      }
    },
    [isTauri, targetAgent, modelLabel]
  );

  const handleAbort = useCallback(async () => {
    setIsAborting(true);
    try {
      if (isTauri) {
        toast.info("Abort is currently not implemented in Tauri");
        return;
      }

      const formData = new FormData();
      formData.append("agent", targetAgent);
      // We could also pass sessionID here if we had it easily accessible,
      // but the backend will handle identifying the active session.

      const res = await fetch("/api/session-abort", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      toast.success(`Sent abort request for ${targetAgent}`);
    } catch (e) {
      toast.error(`Abort failed: ${String(e)}`);
    } finally {
      setIsAborting(false);
    }
  }, [isTauri, targetAgent]);

  if (modelOptions.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 border-border/20 border-b bg-background/30 px-3 py-1">
      <Select
        disabled={isSwitching}
        onValueChange={(val) => applySwitch(val)}
        value={modelLabel}
      >
        <SelectTrigger className="h-7 flex-1 border-border/40 bg-background/60 text-[11px]">
          <SelectValue placeholder="Unknown" />
        </SelectTrigger>
        <SelectContent>
          {modelLabel && !sortedModelOptions.includes(modelLabel) && (
            <SelectItem key="custom" value={modelLabel}>
              {modelLabel}
            </SelectItem>
          )}
          {sortedModelOptions.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              className="rounded border border-primary/30 bg-primary/10 p-1 text-primary transition-colors hover:bg-primary/20"
              onClick={async () => {
                try {
                  if (isTauri) {
                    toast.info(
                      "Session creation is currently not implemented in Tauri"
                    );
                    return;
                  }
                  const res = await fetch("/api/session-create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ agent: targetAgent }),
                  });
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    const errMsg =
                      typeof data.error === "object"
                        ? data.error?.message
                        : data.error;
                    throw new Error(errMsg ?? `HTTP ${res.status}`);
                  }
                  toast.success(`Created a new session for ${targetAgent}`);
                } catch (_e) {
                  toast.error(`Session creation failed: ${String(_e)}`);
                }
              }}
              type="button"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="px-2 py-1 text-[11px]" side="bottom">
            New Session
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              className={cn(
                "rounded border border-red-500/30 bg-red-500/10 p-1 text-red-500 transition-colors hover:bg-red-500/20",
                isAborting && "animate-pulse opacity-50"
              )}
              disabled={isAborting}
              onClick={handleAbort}
              type="button"
            >
              <Square className="h-3.5 w-3.5 fill-red-500/20" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="px-2 py-1 text-[11px]" side="bottom">
            Abort Session
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <ContextBadge value={contextPercent ?? null} />
    </div>
  );
}

function ComradeTab({
  comrade,
  cfg,
  status,
  isSelected,
  onClick,
}: {
  comrade: ComradeId;
  cfg: { label: string; imageSrc: string };
  status?: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const ct = COMRADE_THEME[comrade];
  const isIdle = status === "idle";
  const isProcessing = status && !isIdle && status !== "offline";

  return (
    <button
      className={cn(
        "relative flex flex-col items-center gap-0.5 rounded px-1.5 py-0.5 transition-all duration-150",
        isSelected
          ? ct.selected
          : "text-muted-foreground/50 hover:bg-white/5 hover:text-foreground"
      )}
      onClick={onClick}
      title={
        isProcessing ? `${cfg.label}: ${status.toUpperCase()}...` : cfg.label
      }
      type="button"
    >
      {isProcessing && (
        <span
          className={cn(
            "pointer-events-none absolute inset-0 animate-ping rounded",
            ct.ping
          )}
        />
      )}
      <div
        className={cn(
          "h-5 w-5 overflow-hidden rounded-full border transition-all duration-300",
          isProcessing
            ? cn("animate-bounce", ct.processingBorder, ct.processingGlow)
            : "border-border/30 opacity-60 grayscale",
          isSelected && cn(ct.processingBorder, "opacity-100 grayscale-0")
        )}
      >
        {imgErr ? (
          <div className="flex h-full w-full items-center justify-center bg-white/5 font-semibold text-[8px]">
            {cfg.label[0]}
          </div>
        ) : (
          <img
            alt={cfg.label}
            className="h-full w-full object-cover object-top"
            onError={() => setImgErr(true)}
            src={cfg.imageSrc}
          />
        )}
      </div>
      <span className="font-medium text-[8px] leading-none">
        {cfg.label.slice(0, 2)}
      </span>
    </button>
  );
}

function formatSessionTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function SessionHistoryTriggerBar({
  activeAgentName,
  onOpen,
  selectedSummary,
  sessionSummaries,
  sessionHistoryReady,
  staleSelectionDetected,
  showDetachedBanner,
}: {
  activeAgentName: AgentId;
  onOpen: () => void;
  selectedSummary: SessionHistorySummary | null;
  sessionSummaries: readonly SessionHistorySummary[];
  sessionHistoryReady: boolean;
  staleSelectionDetected: boolean;
  showDetachedBanner: boolean;
}) {
  const hasSavedSessions = sessionSummaries.length > 0;
  const statusLabel = sessionHistoryReady
    ? hasSavedSessions
      ? selectedSummary?.isActive
        ? "Live now"
        : showDetachedBanner
          ? "Viewing history"
          : "Saved"
      : "No saved sessions"
    : "Loading";
  const statusClass = sessionHistoryReady
    ? hasSavedSessions
      ? selectedSummary?.isActive
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
        : showDetachedBanner
          ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
          : "border-border/40 bg-white/5 text-muted-foreground/80"
      : "border-border/40 bg-white/5 text-muted-foreground/80"
    : "border-border/40 bg-white/5 text-muted-foreground/80";
  const headline = sessionHistoryReady
    ? hasSavedSessions
      ? selectedSummary
        ? getSessionHistoryPrimaryLabel(selectedSummary)
        : `Latest session for ${activeAgentName}`
      : `No saved sessions for ${activeAgentName}`
    : `Loading history for ${activeAgentName}`;
  const detail = sessionHistoryReady
    ? hasSavedSessions
      ? selectedSummary
        ? `${getSessionHistoryRelativeTimeLabel(selectedSummary.lastActivityAt)} · ${selectedSummary.messageCount} records`
        : "Read-only history is available."
      : "Existing send and session controls remain unchanged."
    : "Read-only history is still loading.";

  return (
    <button
      className="w-full border-white/5 border-b bg-background/20 px-3 py-1.5 text-left transition-colors hover:bg-background/30"
      onClick={onOpen}
      type="button"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-[11px] text-foreground/90">
              History · {activeAgentName}
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px]",
                statusClass
              )}
            >
              {statusLabel}
            </span>
            {staleSelectionDetected ? (
              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200/90">
                Restored
              </span>
            ) : null}
          </div>
          <div className="mt-1 truncate text-[11px] text-foreground/90">
            {headline}
          </div>
          <div className="truncate text-[10px] text-muted-foreground/70">
            {detail}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <span className="text-[10px] text-muted-foreground/55">
            {sessionSummaries.length} sessions
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70" />
        </div>
      </div>
    </button>
  );
}

function SessionHistorySheet({
  activeAgentName,
  onOpenChange,
  onSelectSession,
  open,
  selectedSessionId,
  selectedSummary,
  sessionSummaries,
  sessionHistoryReady,
  staleSelectionDetected,
  showDetachedBanner,
}: {
  activeAgentName: AgentId;
  onOpenChange: (open: boolean) => void;
  onSelectSession: (sessionId: string | null) => void;
  open: boolean;
  selectedSessionId: string | null;
  selectedSummary: SessionHistorySummary | null;
  sessionSummaries: readonly SessionHistorySummary[];
  sessionHistoryReady: boolean;
  staleSelectionDetected: boolean;
  showDetachedBanner: boolean;
}) {
  const handleSelectSession = useCallback(
    (sessionId: string) => {
      onSelectSession(sessionId);
      onOpenChange(false);
    },
    [onOpenChange, onSelectSession]
  );

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="flex h-full w-full flex-col gap-0 border-white/10 bg-zinc-950/95 p-0 text-foreground shadow-2xl sm:max-w-[440px]"
        side="right"
      >
        <SheetHeader className="border-white/10 border-b px-5 py-4 pr-12">
          <SheetTitle className="text-sm">Session History</SheetTitle>
          <SheetDescription className="text-xs">
            Read-only view for {activeAgentName}. Timeline filtering stays bound
            to the selected session.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-3 border-white/10 border-b px-4 py-4">
            {sessionHistoryReady ? (
              sessionSummaries.length > 0 ? (
                <>
                  {selectedSummary ? (
                    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/80">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5",
                            selectedSummary.isActive
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                              : "border-border/40 bg-white/5 text-muted-foreground/80"
                          )}
                        >
                          {selectedSummary.isActive ? "Active" : "Saved"}
                        </span>
                        <span>{selectedSummary.messageCount} records</span>
                        <span>
                          Started{" "}
                          {formatSessionTimestamp(selectedSummary.startedAt)}
                        </span>
                      </div>
                      <div className="mt-2 truncate text-foreground/90 text-xs">
                        {getSessionHistoryPrimaryLabel(selectedSummary)}
                      </div>
                      <div className="mt-1 truncate text-[11px] text-muted-foreground/75">
                        {getSessionHistoryFallbackLabel(
                          selectedSummary.lastActivityAt
                        )}
                      </div>
                      <div className="mt-2 truncate font-mono text-[10px] text-muted-foreground/50">
                        {selectedSummary.sessionId}
                      </div>
                    </div>
                  ) : null}

                  {staleSelectionDetected ? (
                    <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200/90">
                      Previously selected session was unavailable, so the newest
                      saved session was restored.
                    </div>
                  ) : null}

                  {showDetachedBanner ? (
                    <div className="rounded-md border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-[11px] text-blue-200/90">
                      Another live session is active for {activeAgentName}. This
                      sheet remains pinned to the selected saved session.
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-md border border-border/40 border-dashed bg-background/30 px-3 py-3 text-[11px] text-muted-foreground/75">
                  No saved sessions yet for {activeAgentName}. Existing send and
                  session controls remain unchanged.
                </div>
              )
            ) : (
              <div className="animate-pulse rounded-md border border-border/30 bg-background/40 px-3 py-3 text-[11px] text-muted-foreground/60">
                Loading session history…
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="font-medium text-[11px] text-foreground/90 uppercase tracking-wider">
                Saved sessions
              </div>
              <div className="text-[10px] text-muted-foreground/55">
                {sessionSummaries.length} total
              </div>
            </div>

            {sessionHistoryReady && sessionSummaries.length > 0 ? (
              <div className="space-y-2">
                {sessionSummaries.map((summary) => {
                  const isSelected = summary.sessionId === selectedSessionId;

                  return (
                    <button
                      aria-pressed={isSelected}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                        isSelected
                          ? "border-primary/40 bg-primary/10"
                          : "border-white/10 bg-black/10 hover:bg-white/5"
                      )}
                      key={summary.sessionId}
                      onClick={() => handleSelectSession(summary.sessionId)}
                      type="button"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-medium text-foreground/90 text-xs">
                            {getSessionHistoryPrimaryLabel(summary)}
                          </span>
                          {summary.isActive ? (
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                              Active
                            </span>
                          ) : null}
                          {isSelected ? (
                            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                              Selected
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 truncate text-[11px] text-muted-foreground/75">
                          {getSessionHistoryFallbackLabel(
                            summary.lastActivityAt
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/55">
                          <span>
                            {getSessionHistoryRelativeTimeLabel(
                              summary.lastActivityAt
                            )}
                          </span>
                          <span>{summary.messageCount} records</span>
                          <span>
                            Started {formatSessionTimestamp(summary.startedAt)}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="border-white/10 border-t bg-black/20 px-4 py-3">
            <div className="font-medium text-[11px] text-foreground/90 uppercase tracking-wider">
              Future actions
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground/70 leading-relaxed">
              Resume, Fork, and New will appear here in a later phase. This
              sheet stays read-only for now.
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default memo(AgentChatColumn);

function AgentChatColumn({
  agent,
  records,
  inboxMessages,
  status,
  partyView = null,
  onPartyViewChange,
  partyRecords,
  partyInboxMessages,
  partySessionSummaries,
  busyMap,
  modelOptions = [],
  modelRefreshTrigger,
  modeSwitchTrigger,
  isTauri = false,
  optimisticMessages = [],
  contextPercent,
  sessionHistoryReady = false,
  sessionSummaries = [],
  onSent,
}: AgentChatColumnProps) {
  const { label, Icon, imageSrc, theme } = AGENT_CONFIG[agent];
  const { data: projectsData } = useActiveProjects();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevTimelineLengthRef = useRef(0);
  const previousScrollResetKeyRef = useRef<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [detailItem, setDetailItem] = useState<ChatDetailItem | null>(null);
  const [isCurrentPlanExpanded, setIsCurrentPlanExpanded] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [measuredRowHeights, setMeasuredRowHeights] = useState<
    Map<string, number>
  >(() => new Map());
  const [isSessionHistorySheetOpen, setIsSessionHistorySheetOpen] =
    useState(false);

  // Determine active view: Noctis own data or a comrade's data
  const viewingComrade = agent === "noctis" && partyView !== null;
  const activeRecords =
    viewingComrade && partyView ? (partyRecords?.[partyView] ?? []) : records;
  const activeInboxMessages =
    viewingComrade && partyView
      ? (partyInboxMessages?.[partyView] ?? [])
      : inboxMessages;
  const activeSessionSummaries =
    viewingComrade && partyView
      ? (partySessionSummaries?.[partyView] ?? [])
      : sessionSummaries;
  const activeLabel =
    viewingComrade && partyView ? COMRADE_CONFIG[partyView].label : label;
  const activeIsProcessing = viewingComrade
    ? busyMap?.[partyView as ComradeId] !== "idle" &&
      busyMap?.[partyView as ComradeId] !== "offline" &&
      !!busyMap?.[partyView as ComradeId]
    : status !== "idle" && status !== "offline" && !!status;
  const noctisIsProcessing =
    status !== "idle" && status !== "offline" && !!status;

  // Active column theme: switches to comrade's theme when viewing one
  const activeTheme =
    viewingComrade && partyView ? COMRADE_THEME[partyView].columnTheme : theme;

  // Determine which agent to monitor for live activity
  const activeAgentName = viewingComrade && partyView ? partyView : agent;
  const { selectedSessionId, setSelectedSessionId } =
    useSessionHistorySelection(activeAgentName, activeSessionSummaries);
  const staleSelectionDetected = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    const persistedSelection = localStorage.getItem(
      `chat_selected_session:${activeAgentName}`
    );
    return !!persistedSelection && persistedSelection !== selectedSessionId;
  }, [activeAgentName, selectedSessionId]);
  const selectedSessionSummary = useMemo(
    () =>
      activeSessionSummaries.find(
        (summary) => summary.sessionId === selectedSessionId
      ) ?? null,
    [activeSessionSummaries, selectedSessionId]
  );
  const hasActiveSessionSummary = useMemo(
    () => activeSessionSummaries.some((summary) => summary.isActive),
    [activeSessionSummaries]
  );
  const showDetachedHistoryNotice =
    !!selectedSessionSummary &&
    activeIsProcessing &&
    hasActiveSessionSummary &&
    !selectedSessionSummary.isActive;
  const liveEvents = useAgentActivity(
    activeAgentName,
    activeIsProcessing,
    selectedSessionId
  );
  const showPendingIndicator = activeIsProcessing;
  const activeProjectScope = getProjectScopeForAgent(activeAgentName);
  const scrollResetKey = `${activeAgentName}:${selectedSessionId ?? "__all__"}`;
  const filteredRecords = useMemo(
    () => filterChatLogRecordsBySession(activeRecords, selectedSessionId),
    [activeRecords, selectedSessionId]
  );

  useEffect(() => {
    if (previousScrollResetKeyRef.current === scrollResetKey) {
      return;
    }

    previousScrollResetKeyRef.current = scrollResetKey;
    prevTimelineLengthRef.current = 0;
    isAtBottomRef.current = true;
    setDetailItem(null);
    setIsAtBottom(true);
    setIsCurrentPlanExpanded(false);
    setMeasuredRowHeights(new Map());
    setScrollTop(0);
    setUnreadCount(0);

    const el = scrollRef.current;
    if (el) {
      el.scrollTop = 0;
    }
  }, [scrollResetKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    const updateViewportHeight = () => setViewportHeight(el.clientHeight);
    updateViewportHeight();

    const observer = new ResizeObserver(() => updateViewportHeight());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const projectById = useMemo(
    () =>
      Object.fromEntries(
        (projectsData?.projects ?? []).map((project) => [project.id, project])
      ),
    [projectsData]
  );
  const activeProjectIds =
    activeProjectScope === null
      ? []
      : (projectsData?.projectScopes[activeProjectScope]?.activeProjectIds ??
        []);

  const agentTimeline = useMemo(
    () => buildChatTimeline([...filteredRecords, ...liveEvents]),
    [filteredRecords, liveEvents]
  );

  const timeline = useMemo(
    () =>
      mergeTimeline(
        agentTimeline,
        activeInboxMessages,
        viewingComrade ? [] : optimisticMessages
      ),
    [agentTimeline, activeInboxMessages, optimisticMessages, viewingComrade]
  );
  const virtualRows = useMemo(() => {
    const rows: VirtualTimelineRow[] = timeline.map((item) =>
      item.type === "inbox"
        ? {
            kind: "merged",
            key: `inbox:${item.msg.id}`,
            mergedItem: item,
          }
        : {
            kind: "merged",
            key: item.item.key,
            mergedItem: item,
          }
    );

    if (showPendingIndicator) {
      rows.push({
        agentLabel: activeLabel,
        key: `pending:${activeAgentName}`,
        kind: "pending",
      } as VirtualTimelineRow);
    }

    return rows;
  }, [timeline, showPendingIndicator, activeLabel, activeAgentName]);
  const { layouts: virtualRowLayouts, totalHeight } = useMemo(
    () => buildVirtualRowLayouts(virtualRows, measuredRowHeights),
    [virtualRows, measuredRowHeights]
  );
  const { bottomSpacer, topSpacer, visibleLayouts } = useMemo(
    () => getVisibleVirtualRows(virtualRowLayouts, scrollTop, viewportHeight),
    [virtualRowLayouts, scrollTop, viewportHeight]
  );
  const currentPlanItem = useMemo(
    () => getCurrentPlanItem(agentTimeline),
    [agentTimeline]
  );
  const currentPlanMetrics = useMemo(
    () => (currentPlanItem ? getPlanMetrics(currentPlanItem) : null),
    [currentPlanItem]
  );
  const currentPlanHeadline = useMemo(
    () => (currentPlanItem ? getCurrentPlanHeadline(currentPlanItem) : null),
    [currentPlanItem]
  );

  // Determine target agent for model switching
  let switchTargetAgent: ModelSwitchAgent = "lunafreya";
  if (agent === "noctis") {
    if (
      partyView &&
      (ALL_MODEL_SWITCH_AGENTS as readonly string[]).includes(partyView)
    ) {
      switchTargetAgent = partyView as ModelSwitchAgent;
    } else {
      switchTargetAgent = "noctis";
    }
  }

  // Track whether the user is at the bottom
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    setScrollTop(el.scrollTop);
    const threshold = 32; // px tolerance
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
    if (atBottom) {
      setUnreadCount(0);
    }
  };

  // Auto-follow new messages only if at bottom; track unread count otherwise
  // biome-ignore lint/correctness/useExhaustiveDependencies: triggers
  useEffect(() => {
    const prev = prevTimelineLengthRef.current;
    prevTimelineLengthRef.current = timeline.length;
    const newItems = timeline.length - prev;

    if (!isAtBottomRef.current) {
      if (newItems > 0) {
        setUnreadCount((c) => c + newItems);
      }
      return;
    }
    setUnreadCount(0);
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [timeline.length, activeIsProcessing]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    const maxScrollTop = getDomMaxScrollTop(el);

    if (isAtBottomRef.current) {
      if (viewportHeight <= 0) {
        return;
      }

      if (Math.abs(el.scrollTop - maxScrollTop) < 1) {
        return;
      }

      el.scrollTop = maxScrollTop;
      setScrollTop(maxScrollTop);
      return;
    }

    if (el.scrollTop > maxScrollTop) {
      el.scrollTop = maxScrollTop;
      setScrollTop(maxScrollTop);
    }
  }, [viewportHeight]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setUnreadCount(0);
  }, []);

  const handleOpenDetail = useCallback((item: ChatDetailItem) => {
    setDetailItem(item);
  }, []);

  const handleRowHeightChange = useCallback((key: string, height: number) => {
    setMeasuredRowHeights((prev) => {
      const current = prev.get(key);
      if (current && Math.abs(current - height) < 1) {
        return prev;
      }

      const next = new Map(prev);
      next.set(key, height);
      return next;
    });
  }, []);

  const handleDetailOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setDetailItem(null);
    }
  }, []);

  const handleComposerSent = useCallback(
    (target: AgentId, content: string, id?: string) => {
      isAtBottomRef.current = true;
      setIsAtBottom(true);
      setUnreadCount(0);

      const el = scrollRef.current;
      if (el) {
        const nextScrollTop = getDomMaxScrollTop(el);
        el.scrollTop = nextScrollTop;
        setScrollTop(nextScrollTop);
      }

      onSent?.(target, content, id);
    },
    [onSent]
  );

  const totalCount = agentTimeline.length + activeInboxMessages.length;
  const hasSessionSelection = selectedSessionId !== null;
  const showEmptyTimeline =
    timeline.length === 0 &&
    !activeIsProcessing &&
    (!sessionHistoryReady ||
      activeSessionSummaries.length === 0 ||
      !hasSessionSelection);
  const showSelectedSessionEmptyState =
    timeline.length === 0 &&
    !activeIsProcessing &&
    sessionHistoryReady &&
    activeSessionSummaries.length > 0 &&
    hasSessionSelection;

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-lg border transition-all duration-150",
        activeTheme.border,
        activeTheme.bg
      )}
    >
      {/* Column header */}
      {agent === "noctis" ? (
        <div
          className={cn(
            "flex min-h-[52px] select-none items-center gap-1 rounded-t-lg border-b px-3 py-2",
            activeTheme.headerBorder,
            activeTheme.headerBg
          )}
        >
          {/* Noctis tab */}
          <button
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 transition-colors",
              viewingComrade
                ? "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                : cn("bg-indigo-500/20", theme.text)
            )}
            onClick={() => {
              onPartyViewChange?.(null);
            }}
            type="button"
          >
            <div className="relative shrink-0">
              {noctisIsProcessing && (
                <span className="absolute inset-0 animate-ping rounded-full bg-indigo-400/30" />
              )}
              {imgError ? (
                <Icon
                  className={cn(
                    "h-4 w-4",
                    viewingComrade ? "text-muted-foreground" : theme.text,
                    noctisIsProcessing && "animate-bounce text-indigo-300"
                  )}
                />
              ) : (
                <img
                  alt={label}
                  className={cn(
                    "h-6 w-auto object-contain transition-all duration-300",
                    noctisIsProcessing &&
                      "animate-bounce drop-shadow-[0_0_6px_rgba(99,102,241,0.6)]"
                  )}
                  onError={() => setImgError(true)}
                  src={imageSrc}
                />
              )}
            </div>
            <span className="font-medium text-xs">{label}</span>
          </button>

          {/* Divider */}
          <div className="mx-1 h-5 w-px shrink-0 bg-border/30" />

          {/* Comrade party tabs */}
          <div className="flex items-center gap-0.5">
            {COMRADES.map((comrade) => (
              <ComradeTab
                cfg={COMRADE_CONFIG[comrade]}
                comrade={comrade}
                isSelected={partyView === comrade}
                key={comrade}
                onClick={() => {
                  onPartyViewChange?.(comrade);
                }}
                status={busyMap?.[comrade]}
              />
            ))}
          </div>

          <div className="ml-auto min-w-0">
            {activeProjectScope !== null && (
              <ProjectStatusChip
                activeProjectIds={activeProjectIds}
                loading={projectsData === null}
                projectById={projectById}
                scopeLabel={PROJECT_SCOPE_LABELS[activeProjectScope]}
              />
            )}
          </div>
          <span className="shrink-0 text-[10px] text-muted-foreground/60">
            {totalCount} msgs
          </span>
        </div>
      ) : (
        /* Standard header (Lunafreya) */
        <div
          className={cn(
            "flex min-h-[52px] select-none items-center gap-2 rounded-t-lg border-b px-3 py-2",
            activeTheme.headerBorder,
            activeTheme.headerBg
          )}
        >
          <div className="relative shrink-0">
            {activeIsProcessing && (
              <span className="absolute inset-0 animate-ping rounded-full bg-slate-200/20" />
            )}
            {imgError ? (
              <Icon
                className={cn(
                  "h-4 w-4",
                  theme.text,
                  activeIsProcessing && "animate-bounce"
                )}
              />
            ) : (
              <img
                alt={label}
                className={cn(
                  "h-6 w-auto object-contain transition-all duration-300",
                  activeIsProcessing &&
                    "animate-bounce drop-shadow-[0_0_6px_rgba(226,232,240,0.6)]"
                )}
                onError={() => setImgError(true)}
                src={imageSrc}
              />
            )}
          </div>
          <span className={cn("font-medium text-xs", activeTheme.text)}>
            {label}
          </span>
          <div className="ml-auto min-w-0">
            {activeProjectScope !== null && (
              <ProjectStatusChip
                activeProjectIds={activeProjectIds}
                loading={projectsData === null}
                projectById={projectById}
                scopeLabel={PROJECT_SCOPE_LABELS[activeProjectScope]}
              />
            )}
          </div>
          <span className="text-[10px] text-muted-foreground/60">
            {totalCount} msgs
          </span>
        </div>
      )}

      <ModelSwitchBar
        contextPercent={contextPercent}
        isTauri={isTauri}
        key={switchTargetAgent}
        modelOptions={modelOptions}
        modelRefreshTrigger={modelRefreshTrigger}
        modeSwitchTrigger={modeSwitchTrigger}
        targetAgent={switchTargetAgent}
      />

      <SessionHistoryTriggerBar
        activeAgentName={activeAgentName}
        onOpen={() => setIsSessionHistorySheetOpen(true)}
        selectedSummary={selectedSessionSummary}
        sessionHistoryReady={sessionHistoryReady}
        sessionSummaries={activeSessionSummaries}
        showDetachedBanner={showDetachedHistoryNotice}
        staleSelectionDetected={staleSelectionDetected}
      />

      <SessionHistorySheet
        activeAgentName={activeAgentName}
        onOpenChange={setIsSessionHistorySheetOpen}
        onSelectSession={setSelectedSessionId}
        open={isSessionHistorySheetOpen}
        selectedSessionId={selectedSessionId}
        selectedSummary={selectedSessionSummary}
        sessionHistoryReady={sessionHistoryReady}
        sessionSummaries={activeSessionSummaries}
        showDetachedBanner={showDetachedHistoryNotice}
        staleSelectionDetected={staleSelectionDetected}
      />

      {/* Scrollable message list */}
      <div className="relative min-h-0 flex-1">
        <div
          className="h-full overflow-y-auto px-3 py-3"
          onScroll={handleScroll}
          ref={scrollRef}
        >
          {showEmptyTimeline ? (
            <div className="flex h-full items-center justify-center text-muted-foreground/60 text-sm">
              No messages yet
            </div>
          ) : showSelectedSessionEmptyState ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <div className="text-muted-foreground/70 text-sm">
                No records found for the selected session.
              </div>
              <div className="max-w-xs text-[11px] text-muted-foreground/55 leading-relaxed">
                Open History to switch to another saved session. Message sending
                and session controls are unchanged in this phase.
              </div>
            </div>
          ) : (
            <>
              <div style={{ height: topSpacer }} />
              {visibleLayouts.map((layout) => (
                <VirtualizedTimelineRow
                  activeLabel={activeLabel}
                  key={layout.key}
                  layout={layout}
                  onHeightChange={handleRowHeightChange}
                  onOpenDetail={handleOpenDetail}
                />
              ))}
              <div style={{ height: bottomSpacer }} />
              {visibleLayouts.length === 0 &&
              totalHeight === 0 &&
              showPendingIndicator ? (
                <PendingIndicator agentLabel={activeLabel} />
              ) : null}
            </>
          )}
        </div>

        {/* Scroll-to-bottom float button */}
        {!isAtBottom && (
          <button
            className={cn(
              "absolute right-3 bottom-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40 backdrop-blur-sm transition-all duration-200 hover:bg-black/60",
              activeTheme.text
            )}
            onClick={scrollToBottom}
            type="button"
          >
            <ChevronDown className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-0.5 font-bold text-[9px] text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        )}
      </div>

      {currentPlanItem && currentPlanMetrics ? (
        <div className="sticky bottom-0 z-10 border-white/10 border-t bg-black/20 px-3 py-2 backdrop-blur-sm">
          <div
            className={cn(
              "grid transition-all duration-300 ease-out",
              isCurrentPlanExpanded
                ? "mb-2 grid-rows-[1fr] opacity-100"
                : "mb-0 grid-rows-[0fr] opacity-0"
            )}
          >
            <div className="overflow-hidden">
              <div
                className={cn(
                  "rounded-lg border border-white/10 bg-black/30 p-2.5 transition-all duration-300 ease-out",
                  isCurrentPlanExpanded
                    ? "translate-y-0 scale-100"
                    : "-translate-y-1 scale-[0.98]"
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-[11px] text-foreground/90">
                      Current Plan
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground/75">
                      {currentPlanHeadline}
                    </div>
                  </div>
                  <button
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                    onClick={() =>
                      handleOpenDetail({
                        type: "execution",
                        item: currentPlanItem,
                      })
                    }
                    type="button"
                  >
                    Open detail
                  </button>
                </div>

                <div className="mb-2 h-1 rounded-full bg-white/10">
                  <div
                    className="h-1 rounded-full bg-emerald-400/80 transition-all"
                    style={{
                      width:
                        currentPlanMetrics.total > 0
                          ? `${(currentPlanMetrics.completed / currentPlanMetrics.total) * 100}%`
                          : "18%",
                    }}
                  />
                </div>

                <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/85">
                  {currentPlanMetrics.total > 0 ? (
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                      {currentPlanMetrics.completed}/{currentPlanMetrics.total}{" "}
                      done
                    </span>
                  ) : (
                    <span className="rounded-full border border-slate-500/20 bg-slate-500/10 px-2 py-0.5 text-slate-300">
                      Updating
                    </span>
                  )}
                  {currentPlanMetrics.inProgress > 0 ? (
                    <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-blue-300">
                      {currentPlanMetrics.inProgress} active
                    </span>
                  ) : null}
                  {currentPlanMetrics.left > 0 ? (
                    <span className="rounded-full border border-slate-500/20 bg-slate-500/10 px-2 py-0.5 text-slate-300">
                      {currentPlanMetrics.left} left
                    </span>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  {currentPlanItem.todos.length > 0 ? (
                    currentPlanItem.todos.map((todo) => {
                      const normalizedStatus = normalizePlanStatus(todo.status);
                      return (
                        <div
                          className="flex items-start gap-2 rounded-md border border-border/30 bg-black/10 px-2 py-1.5 text-xs"
                          key={`${currentPlanItem.key}-${todo.id}`}
                        >
                          <span
                            className={cn(
                              "mt-0.5 w-3 text-center",
                              normalizedStatus === "completed"
                                ? "text-emerald-300"
                                : normalizedStatus === "in_progress"
                                  ? "text-blue-300"
                                  : "text-muted-foreground/80"
                            )}
                          >
                            {renderPlanStatusGlyph(todo.status)}
                          </span>
                          <span
                            className={cn(
                              "flex-1",
                              normalizedStatus === "completed"
                                ? "text-foreground/55 line-through"
                                : normalizedStatus === "in_progress"
                                  ? "font-medium text-foreground"
                                  : "text-foreground/90"
                            )}
                          >
                            {todo.title}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-md border border-border/30 bg-black/10 px-2.5 py-2 text-[11px] text-muted-foreground/80">
                      Plan updating...
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <button
            className="flex w-full items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-left transition-colors duration-200 hover:bg-black/40"
            onClick={() => setIsCurrentPlanExpanded((value) => !value)}
            type="button"
          >
            <span className="shrink-0 font-medium text-[11px] text-foreground/90">
              Current Plan
            </span>

            {currentPlanMetrics.total > 0 ? (
              <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                {currentPlanMetrics.completed}/{currentPlanMetrics.total}
              </span>
            ) : (
              <span className="shrink-0 rounded-full border border-slate-500/20 bg-slate-500/10 px-2 py-0.5 text-[10px] text-slate-300">
                Updating
              </span>
            )}

            {currentPlanMetrics.inProgress > 0 ? (
              <span className="shrink-0 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-300">
                {currentPlanMetrics.inProgress} active
              </span>
            ) : null}

            {currentPlanMetrics.left > 0 ? (
              <span className="shrink-0 rounded-full border border-slate-500/20 bg-slate-500/10 px-2 py-0.5 text-[10px] text-slate-300">
                {currentPlanMetrics.left} left
              </span>
            ) : null}

            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground/70">
              {currentPlanHeadline}
            </span>

            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-300 ease-out",
                isCurrentPlanExpanded ? "rotate-180" : "rotate-0"
              )}
            />
          </button>
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-0 py-1">
        <ChevronUp
          className={cn("h-3 w-3 animate-bounce opacity-20", activeTheme.text)}
          style={{ animationDelay: "300ms" }}
        />
        <ChevronUp
          className={cn(
            "-mt-1.5 h-3 w-3 animate-bounce opacity-50",
            activeTheme.text
          )}
          style={{ animationDelay: "150ms" }}
        />
        <ChevronUp
          className={cn("-mt-1.5 h-3 w-3 animate-bounce", activeTheme.text)}
          style={{ animationDelay: "0ms" }}
        />
        <div className="mt-0.5 w-24">
          <div
            className={cn(
              "h-px animate-pulse rounded-full bg-gradient-to-r",
              activeTheme.separator
            )}
          />
        </div>
      </div>

      <MessageComposer
        compact
        isTauri={isTauri}
        onSent={handleComposerSent}
        targetAgent={viewingComrade && partyView ? partyView : agent}
        targetAgentImageSrc={
          viewingComrade && partyView
            ? COMRADE_CONFIG[partyView].imageSrc
            : AGENT_CONFIG[agent].imageSrc
        }
        targetAgentLabel={
          viewingComrade && partyView
            ? COMRADE_CONFIG[partyView].label
            : AGENT_CONFIG[agent].label
        }
      />

      <ChatDetailSheet
        activeLabel={activeLabel}
        item={detailItem}
        onOpenChange={handleDetailOpenChange}
        open={detailItem !== null}
      />
    </div>
  );
}

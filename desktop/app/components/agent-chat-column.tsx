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
import type { ChatDetailItem } from "@/lib/chat-detail";
import {
  buildChatTimeline,
  type ChatLogRecord,
  type ChatTimelineItem,
} from "@/lib/chat-timeline";
import {
  getProjectScopeForAgent,
  PROJECT_SCOPE_LABELS,
} from "@/lib/project-scopes";
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
  /** Party props — only used when agent === "noctis" */
  partyView?: ComradeId | null;
  records: ChatLogRecord[];
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
      ts: item.type === "message" ? item.lastTs : item.lastTs,
    })),
    ...inboxMessages.map((m) => ({ type: "inbox" as const, msg: m, ts: m.ts })),
    ...filteredOptimistic.map((m) => ({
      type: "inbox" as const,
      msg: m,
      ts: m.ts,
    })),
  ].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
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
  busyMap,
  modelOptions = [],
  modelRefreshTrigger,
  modeSwitchTrigger,
  isTauri = false,
  optimisticMessages = [],
  contextPercent,
  onSent,
}: AgentChatColumnProps) {
  const { label, Icon, imageSrc, theme } = AGENT_CONFIG[agent];
  const { data: projectsData } = useActiveProjects();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevTimelineLengthRef = useRef(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [detailItem, setDetailItem] = useState<ChatDetailItem | null>(null);

  // Determine active view: Noctis own data or a comrade's data
  const viewingComrade = agent === "noctis" && partyView !== null;
  const activeRecords =
    viewingComrade && partyView ? (partyRecords?.[partyView] ?? []) : records;
  const activeInboxMessages =
    viewingComrade && partyView
      ? (partyInboxMessages?.[partyView] ?? [])
      : inboxMessages;
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
  const previousActiveAgentNameRef = useRef(activeAgentName);
  const liveEvents = useAgentActivity(activeAgentName, activeIsProcessing);
  const showPendingIndicator = activeIsProcessing;
  const activeProjectScope = getProjectScopeForAgent(activeAgentName);

  useEffect(() => {
    if (previousActiveAgentNameRef.current === activeAgentName) {
      return;
    }

    previousActiveAgentNameRef.current = activeAgentName;
    setDetailItem(null);
  }, [activeAgentName]);

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
    () => buildChatTimeline([...activeRecords, ...liveEvents]),
    [activeRecords, liveEvents]
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

  const handleDetailOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setDetailItem(null);
    }
  }, []);

  const totalCount = agentTimeline.length + activeInboxMessages.length;

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

      {/* Scrollable message list */}
      <div className="relative min-h-0 flex-1">
        <div
          className="h-full space-y-3 overflow-y-auto px-3 py-3"
          onScroll={handleScroll}
          ref={scrollRef}
        >
          {timeline.length === 0 && !activeIsProcessing ? (
            <div className="flex h-full items-center justify-center text-muted-foreground/60 text-sm">
              No messages yet
            </div>
          ) : (
            <>
              {timeline.map((item) =>
                item.type === "inbox" ? (
                  <InboxBubble key={item.msg.id} msg={item.msg} />
                ) : (
                  /* Agent answer — left-aligned with label */
                  <div
                    className="flex flex-col items-start gap-0.5"
                    key={item.item.key}
                  >
                    <span className="ml-1 font-semibold text-[10px] text-muted-foreground/60">
                      {activeLabel}
                    </span>
                    <div className="w-full">
                      {item.item.type === "message" ? (
                        <MessageCard
                          onOpenDetail={handleOpenDetail}
                          record={item.item}
                        />
                      ) : (
                        <ExecutionCard
                          item={item.item}
                          onOpenDetail={handleOpenDetail}
                        />
                      )}
                    </div>
                  </div>
                )
              )}
              {showPendingIndicator && (
                <PendingIndicator agentLabel={activeLabel} />
              )}
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
        onSent={onSent}
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

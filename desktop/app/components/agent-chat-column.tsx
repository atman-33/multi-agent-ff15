import { invoke } from "@tauri-apps/api/core";
import { Crown, MessageSquarePlus, Moon, Square } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import MessageCard from "@/components/message-card";
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
import { ALL_MODEL_SWITCH_AGENTS, type ModelSwitchAgent } from "@/lib/agents";
import { useAgentActivity } from "@/lib/use-agent-activity";
import type { ChatLogRecord } from "@/lib/use-agent-chat-log";
import {
  COMRADE_CONFIG,
  COMRADES,
  type ComradeId,
} from "@/lib/use-comrade-status";
import type { InboxLogRecord } from "@/lib/use-inbox-log";
import { cn } from "@/lib/utils";

interface AgentChatColumnProps {
  agent: "noctis" | "lunafreya";
  busyMap?: Record<ComradeId, string>;
  contextPercent?: number | null;
  inboxMessages: InboxLogRecord[];
  isActive: boolean;
  isTauri?: boolean;
  modelOptions?: string[];
  modeSwitchTrigger?: number;
  onActivate: () => void;
  onPartyViewChange?: (view: ComradeId | null) => void;
  optimisticMessages?: InboxLogRecord[];
  partyInboxMessages?: Partial<Record<ComradeId, InboxLogRecord[]>>;
  partyRecords?: Partial<Record<ComradeId, ChatLogRecord[]>>;
  /** Party props — only used when agent === "noctis" */
  partyView?: ComradeId | null;
  records: ChatLogRecord[];
  status?: string;
}

const AGENT_CONFIG = {
  noctis: {
    label: "Noctis",
    Icon: Crown,
    shortcut: "Ctrl+1",
    imageSrc: "/images/noctis.png",
  },
  lunafreya: {
    label: "Lunafreya",
    Icon: Moon,
    shortcut: "Ctrl+2",
    imageSrc: "/images/lunafreya.png",
  },
} as const;

type MergedItem =
  | { type: "agent"; record: ChatLogRecord; ts: string }
  | { type: "inbox"; msg: InboxLogRecord; ts: string };

/** Merge agent records and inbox messages by UTC timestamp (pure sort) with optimistic deduplication. */
function mergeTimeline(
  records: ChatLogRecord[],
  inboxMessages: InboxLogRecord[],
  optimisticMessages: InboxLogRecord[] = []
): MergedItem[] {
  const realIds = new Set(inboxMessages.map((m) => m.id));
  const filteredOptimistic = optimisticMessages.filter(
    (m) => !realIds.has(m.id)
  );

  return [
    ...records.map((r) => ({ type: "agent" as const, record: r, ts: r.ts })),
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
          "max-w-full rounded bg-black/20 p-1.5 text-[11px]",
          wrap ? "whitespace-pre-wrap break-words" : "overflow-x-auto"
        )}
      >
        {children}
      </pre>
    </div>
  );
}

/** Inbox message bubble — Crystal (right-aligned purple) or agent (left-aligned amber). */
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
            remarkPlugins={[remarkGfm]}
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
        <span className="font-semibold text-[10px] text-amber-400/80">
          {fromLabel}
        </span>
        <span className="text-[10px] text-muted-foreground/50">{timeStr}</span>
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-foreground/85 text-xs leading-relaxed shadow-sm">
        <ReactMarkdown
          className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          components={mdComponents}
          remarkPlugins={[remarkGfm]}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
});

/** Typing indicator — three bouncing dots with scrolling activity log (up to 5 lines). */
function TypingIndicator({
  activityLines,
  agentLabel,
}: {
  activityLines?: string[];
  agentLabel: string;
}) {
  const lines = activityLines ?? [];
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[10px] text-muted-foreground/50">{agentLabel}</span>
      <div className="flex flex-col gap-1.5 rounded-2xl rounded-tl-sm border border-border/30 bg-white/5 px-3 py-2.5">
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
        {lines.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {lines.map((line, i) => (
              <span
                className={cn(
                  "max-w-[260px] truncate font-mono text-[10px]",
                  i === lines.length - 1
                    ? "text-amber-400/80"
                    : "text-muted-foreground/35"
                )}
                // biome-ignore lint/suspicious/noArrayIndexKey: ordered log lines
                key={i}
              >
                {line}
              </span>
            ))}
          </div>
        )}
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
}: {
  targetAgent: ModelSwitchAgent;
  modelOptions: string[];
  isTauri: boolean;
  contextPercent?: number | null;
  modeSwitchTrigger?: number;
}) {
  const [modelLabel, setModelLabel] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);
  const [isAborting, setIsAborting] = useState(false);

  const sortedModelOptions = useMemo(
    () => [...modelOptions].sort((a, b) => a.localeCompare(b)),
    [modelOptions]
  );

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
          return;
        }
        const data = (await res.json()) as { model?: string };
        const { model } = data;
        if (cancelled || !model) {
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
        // Ignored
      }
    };
    fetchModel();
    return () => {
      cancelled = true;
    };
  }, [targetAgent, modelOptions, isTauri, modeSwitchTrigger]);

  // Fallback to first option if empty and we have options, but only after a short delay so we can fetch first
  useEffect(() => {
    if (!modelLabel && modelOptions.length > 0) {
      const timer = setTimeout(() => {
        setModelLabel((prev) => (prev ? prev : modelOptions[0]));
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [modelOptions, modelLabel]);

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
          <SelectValue placeholder="Select model" />
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
  _comrade,
  cfg,
  status,
  isSelected,
  onClick,
}: {
  _comrade: ComradeId;
  cfg: { label: string; imageSrc: string };
  status?: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const isIdle = status === "idle";
  const isProcessing = status && !isIdle && status !== "offline";

  return (
    <button
      className={cn(
        "relative flex flex-col items-center gap-0.5 rounded px-1.5 py-0.5 transition-all duration-150",
        isSelected
          ? "bg-amber-500/20 text-amber-300"
          : "text-muted-foreground/50 hover:bg-white/5 hover:text-foreground"
      )}
      onClick={onClick}
      title={
        isProcessing ? `${cfg.label}: ${status.toUpperCase()}...` : cfg.label
      }
      type="button"
    >
      {isProcessing && (
        <span className="pointer-events-none absolute inset-0 animate-ping rounded bg-amber-400/10" />
      )}
      <div
        className={cn(
          "h-5 w-5 overflow-hidden rounded-full border transition-all duration-300",
          isProcessing
            ? "animate-bounce border-amber-400/70 shadow-[0_0_6px_rgba(251,191,36,0.4)]"
            : "border-border/30 opacity-60 grayscale",
          isSelected && "border-amber-400/80 opacity-100 grayscale-0"
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
  isActive,
  onActivate,
  partyView = null,
  onPartyViewChange,
  partyRecords,
  partyInboxMessages,
  busyMap,
  modelOptions = [],
  modeSwitchTrigger,
  isTauri = false,
  optimisticMessages = [],
  contextPercent,
}: AgentChatColumnProps) {
  const { label, Icon, imageSrc } = AGENT_CONFIG[agent];
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [imgError, setImgError] = useState(false);

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

  // Determine which agent to monitor for live activity
  const activeAgentName = viewingComrade && partyView ? partyView : agent;
  const activityLines = useAgentActivity(activeAgentName, activeIsProcessing);

  const timeline = useMemo(
    () =>
      mergeTimeline(
        activeRecords,
        activeInboxMessages,
        viewingComrade ? [] : optimisticMessages
      ),
    [activeRecords, activeInboxMessages, optimisticMessages, viewingComrade]
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
    isAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  };

  // Auto-follow new messages only if at bottom (task 4.1)
  // biome-ignore lint/correctness/useExhaustiveDependencies: triggers
  useEffect(() => {
    if (!isAtBottomRef.current) {
      return;
    }
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [timeline.length, activeIsProcessing]);

  const totalCount = activeRecords.length + activeInboxMessages.length;

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-lg border transition-all duration-150",
        isActive
          ? "border-primary/60 bg-primary/5 shadow-sm"
          : "border-border/40 bg-white/3"
      )}
    >
      {/* Column header */}
      {agent === "noctis" ? (
        /* Party tab bar: Noctis + Comrades */
        <div
          className={cn(
            "flex select-none items-center gap-1 rounded-t-lg border-b px-3 py-2",
            isActive ? "border-primary/40 bg-primary/10" : "border-border/30"
          )}
        >
          {/* Noctis tab */}
          <button
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 transition-colors",
              viewingComrade
                ? "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                : "bg-primary/20 text-primary"
            )}
            onClick={() => {
              onActivate();
              onPartyViewChange?.(null);
            }}
            type="button"
          >
            <div className="relative shrink-0">
              {noctisIsProcessing && (
                <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/30" />
              )}
              {imgError ? (
                <Icon
                  className={cn(
                    "h-4 w-4",
                    viewingComrade ? "text-muted-foreground" : "text-primary",
                    noctisIsProcessing && "animate-bounce text-amber-400"
                  )}
                />
              ) : (
                <img
                  alt={label}
                  className={cn(
                    "h-6 w-auto object-contain transition-all duration-300",
                    noctisIsProcessing &&
                      "animate-bounce drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]"
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
                _comrade={comrade}
                cfg={COMRADE_CONFIG[comrade]}
                isSelected={partyView === comrade}
                key={comrade}
                onClick={() => {
                  onActivate();
                  onPartyViewChange?.(comrade);
                }}
                status={busyMap?.[comrade]}
              />
            ))}
          </div>

          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/60">
            {totalCount} msgs
          </span>
        </div>
      ) : (
        /* Standard header (Lunafreya) */
        <button
          className={cn(
            "flex cursor-pointer select-none items-center gap-2 rounded-t-lg border-b px-3 py-2 transition-colors",
            isActive
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/30 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          )}
          onClick={onActivate}
          type="button"
        >
          <div className="relative shrink-0">
            {activeIsProcessing && (
              <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/30" />
            )}
            {imgError ? (
              <Icon
                className={cn(
                  "h-4 w-4",
                  isActive ? "text-primary" : "text-muted-foreground",
                  activeIsProcessing && "animate-bounce text-amber-400"
                )}
              />
            ) : (
              <img
                alt={label}
                className={cn(
                  "h-7 w-auto object-contain transition-all duration-300",
                  activeIsProcessing &&
                    "animate-bounce drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]"
                )}
                onError={() => setImgError(true)}
                src={imageSrc}
              />
            )}
          </div>
          <span className="font-medium text-sm">{label}</span>
          <span className="ml-auto text-[10px] text-muted-foreground/60">
            {totalCount} msgs
          </span>
        </button>
      )}

      <ModelSwitchBar
        contextPercent={contextPercent}
        isTauri={isTauri}
        key={switchTargetAgent}
        modelOptions={modelOptions}
        modeSwitchTrigger={modeSwitchTrigger}
        targetAgent={switchTargetAgent}
      />

      {/* Scrollable message list */}
      <div
        className="min-h-0 flex-1 cursor-pointer space-y-3 overflow-y-auto px-3 py-3"
        onClick={onActivate} // dummy for a11y
        onKeyDown={() => {
          // Intentional dummy for accessibility
        }}
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
                  key={item.record.id}
                >
                  <span className="ml-1 font-semibold text-[10px] text-muted-foreground/60">
                    {activeLabel}
                  </span>
                  <div className="w-full">
                    <MessageCard record={item.record} />
                  </div>
                </div>
              )
            )}
            {/* Typing indicator */}
            {activeIsProcessing && (
              <TypingIndicator
                activityLines={activityLines}
                agentLabel={activeLabel}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

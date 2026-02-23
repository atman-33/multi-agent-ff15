import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Crown, Moon, Zap, MessageSquarePlus } from "lucide-react";
import MessageCard from "@/components/MessageCard";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import type { ChatLogRecord, AgentId } from "@/lib/useAgentChatLog";
import type { InboxLogRecord } from "@/lib/useInboxLog";
import { COMRADES, COMRADE_CONFIG, type ComradeId } from "@/lib/useComradeStatus";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { type ModelSwitchAgent, ALL_MODEL_SWITCH_AGENTS } from "@/lib/agents";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AgentChatColumnProps {
  agent: "noctis" | "lunafreya";
  records: ChatLogRecord[];
  inboxMessages: InboxLogRecord[];
  isWaiting: boolean;
  isActive: boolean;
  onActivate: () => void;
  /** Party props — only used when agent === "noctis" */
  partyView?: ComradeId | null;
  onPartyViewChange?: (view: ComradeId | null) => void;
  partyRecords?: Partial<Record<ComradeId, ChatLogRecord[]>>;
  partyInboxMessages?: Partial<Record<ComradeId, InboxLogRecord[]>>;
  busyMap?: Record<ComradeId, boolean>;
  modelOptions?: string[];
  isTauri?: boolean;
  optimisticMessages?: InboxLogRecord[];
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
  | { type: "agent"; record: ChatLogRecord; ts: string; }
  | { type: "inbox"; msg: InboxLogRecord; ts: string; };

/** Merge agent records and inbox messages by UTC timestamp (pure sort) with optimistic deduplication. */
function mergeTimeline(
  records: ChatLogRecord[],
  inboxMessages: InboxLogRecord[],
  optimisticMessages: InboxLogRecord[] = []
): MergedItem[] {
  const realIds = new Set(inboxMessages.map((m) => m.id));
  const filteredOptimistic = optimisticMessages.filter((m) => !realIds.has(m.id));

  return [
    ...records.map((r) => ({ type: "agent" as const, record: r, ts: r.ts })),
    ...inboxMessages.map((m) => ({ type: "inbox" as const, msg: m, ts: m.ts })),
    ...filteredOptimistic.map((m) => ({ type: "inbox" as const, msg: m, ts: m.ts })),
  ].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
}

/** Code block with wrap/scroll toggle button (appears on hover). */
function CodeBlock({ children }: { children: React.ReactNode; }) {
  const [wrap, setWrap] = useState(false);
  return (
    <div className="relative group my-1">
      <button
        type="button"
        onClick={() => setWrap((v) => !v)}
        title={wrap ? "Switch to scroll mode" : "Switch to wrap mode"}
        className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-white/10 hover:bg-white/20 rounded px-1.5 py-0.5 text-[9px] text-muted-foreground/70 hover:text-foreground/80 leading-none"
      >
        {wrap ? "→ scroll" : "↵ wrap"}
      </button>
      <pre
        className={cn(
          "max-w-full bg-black/20 rounded p-1.5 text-[11px]",
          wrap ? "whitespace-pre-wrap break-words" : "overflow-x-auto"
        )}
      >
        {children}
      </pre>
    </div>
  );
}

/** Inbox message bubble — Crystal (right-aligned purple) or agent (left-aligned amber). */
function InboxBubble({ msg }: { msg: InboxLogRecord; }) {
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
  const mdComponents = useMemo<Components>(() => ({
    img: () => null,
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">
        {children}
      </a>
    ),
    code: ({ children }) => (
      <code className="bg-black/30 rounded px-1 font-mono text-[11px]">{children}</code>
    ),
    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  }), []);

  if (isCrystal) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/50">{timeStr}</span>
          <span className="text-[10px] font-semibold text-primary/80">Crystal</span>
        </div>
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary/20 border border-primary/30 px-3 py-2 text-xs leading-relaxed text-foreground/90 shadow-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
            components={mdComponents}
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
        <span className="text-[10px] font-semibold text-amber-400/80">{fromLabel}</span>
        <span className="text-[10px] text-muted-foreground/50">{timeStr}</span>
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-xs leading-relaxed text-foreground/85 shadow-sm">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          components={mdComponents}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

/** Typing indicator — three bouncing dots. */
function TypingIndicator({ agentLabel }: { agentLabel: string; }) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[10px] text-muted-foreground/50">{agentLabel}</span>
      <div className="rounded-2xl rounded-tl-sm bg-white/5 border border-border/30 px-3 py-2.5 flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.9s" }}
          />
        ))}
      </div>
    </div>
  );
}

function ModelSwitchBar({
  targetAgent,
  modelOptions,
  isTauri,
}: {
  targetAgent: ModelSwitchAgent;
  modelOptions: string[];
  isTauri: boolean;
}) {
  const [modelLabel, setModelLabel] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);

  // Initialize current model
  useEffect(() => {
    let cancelled = false;
    const fetchModel = async () => {
      if (isTauri) return; // Currently omitted for Tauri
      if (modelOptions.length === 0) return;

      try {
        const res = await fetch(`/api/current-model?agent=${targetAgent}`);
        if (!res.ok) return;
        const data = (await res.json()) as { model?: string; };
        if (cancelled || !data.model) return;

        // Try to match the returned model name (e.g. "Claude Sonnet 4") with options (e.g. "Claude Sonnet 4.6")
        // Check contains in both directions
        const exactOpt = modelOptions.find(
          (opt) =>
            opt.toLowerCase() === data.model!.toLowerCase() ||
            opt.toLowerCase().includes(data.model!.toLowerCase()) ||
            data.model!.toLowerCase().includes(opt.toLowerCase())
        );
        setModelLabel(exactOpt ?? data.model);
      } catch (e) {
        // Ignored
      }
    };
    fetchModel();
    return () => { cancelled = true; };
  }, [targetAgent, modelOptions, isTauri]);

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
      if (!newModel) return;
      setIsSwitching(true);
      const prevModel = modelLabel;
      setModelLabel(newModel); // Optimistic UI update

      try {
        if (isTauri) {
          await invoke("switch_agent_model", { agent: targetAgent, label: newModel });
        } else {
          const res = await fetch("/api/model-switch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agent: targetAgent, label: newModel }),
          });
          if (!res.ok) {
            const data = (await res.json()) as { error?: string; };
            throw new Error(data.error ?? `HTTP ${res.status}`);
          }
        }
        toast.success(`Switched ${targetAgent} to ${newModel}`);
      } catch (e) {
        toast.error(`Model switch failed: ${String(e)}`);
        setModelLabel(prevModel); // Revert on failure
      } finally {
        setIsSwitching(false);
      }
    },
    [isTauri, targetAgent, modelLabel]
  );


  if (modelOptions.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border/20 bg-background/30">
      <Select
        value={modelLabel}
        onValueChange={(val) => applySwitch(val)}
        disabled={isSwitching}
      >
        <SelectTrigger className="flex-1 h-7 bg-background/60 text-[11px] border-border/40">
          <SelectValue placeholder="Select model" />
        </SelectTrigger>
        <SelectContent>
          {modelLabel && !modelOptions.includes(modelLabel) && (
            <SelectItem key="custom" value={modelLabel}>
              {modelLabel}
            </SelectItem>
          )}
          {modelOptions.map((opt) => (
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
              type="button"
              onClick={async () => {
                try {
                  if (isTauri) {
                    toast.info("Session creation is currently not implemented in Tauri");
                    return;
                  }
                  const res = await fetch("/api/session-create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ agent: targetAgent }),
                  });
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    const errMsg = typeof data.error === "object" ? data.error?.message : data.error;
                    throw new Error(errMsg ?? `HTTP ${res.status}`);
                  }
                  toast.success(`Created a new session for ${targetAgent}`);
                } catch (e) {
                  toast.error(`Session creation failed: ${String(e)}`);
                }
              }}
              className="p-1 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[11px] px-2 py-1">
            New Session
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function ComradeTab({
  comrade,
  cfg,
  busy,
  isSelected,
  onClick,
}: {
  comrade: ComradeId;
  cfg: { label: string; imageSrc: string; };
  busy: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      title={busy ? `${cfg.label}: Processing...` : cfg.label}
      className={cn(
        "relative flex flex-col items-center gap-0.5 px-1.5 py-0.5 rounded transition-all duration-150",
        isSelected
          ? "bg-amber-500/20 text-amber-300"
          : "text-muted-foreground/50 hover:text-foreground hover:bg-white/5"
      )}
    >
      {busy && (
        <span className="absolute inset-0 rounded animate-ping bg-amber-400/10 pointer-events-none" />
      )}
      <div
        className={cn(
          "h-5 w-5 rounded-full overflow-hidden border transition-all duration-300",
          busy
            ? "border-amber-400/70 shadow-[0_0_6px_rgba(251,191,36,0.4)] animate-bounce"
            : "border-border/30 grayscale opacity-60",
          isSelected && "border-amber-400/80 opacity-100 grayscale-0"
        )}
      >
        {!imgErr ? (
          <img
            src={cfg.imageSrc}
            alt={cfg.label}
            onError={() => setImgErr(true)}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-white/5 text-[8px] font-semibold">
            {cfg.label[0]}
          </div>
        )}
      </div>
      <span className="text-[8px] font-medium leading-none">{cfg.label.slice(0, 2)}</span>
    </button>
  );
}

export default function AgentChatColumn({
  agent,
  records,
  inboxMessages,
  isWaiting,
  isActive,
  onActivate,
  partyView = null,
  onPartyViewChange,
  partyRecords,
  partyInboxMessages,
  busyMap,
  modelOptions = [],
  isTauri = false,
  optimisticMessages = [],
}: AgentChatColumnProps) {
  const { label, Icon, imageSrc } = AGENT_CONFIG[agent];
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [imgError, setImgError] = useState(false);

  // Determine active view: Noctis own data or a comrade's data
  const viewingComrade = agent === "noctis" && partyView !== null;
  const activeRecords = viewingComrade ? (partyRecords?.[partyView!] ?? []) : records;
  const activeInboxMessages = viewingComrade ? (partyInboxMessages?.[partyView!] ?? []) : inboxMessages;
  const activeLabel = viewingComrade ? COMRADE_CONFIG[partyView!].label : label;
  const activeIsWaiting = viewingComrade ? false : isWaiting;

  const timeline = mergeTimeline(activeRecords, activeInboxMessages, viewingComrade ? [] : optimisticMessages);

  // Track whether the user is at the bottom
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 32; // px tolerance
    isAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  };

  // Auto-follow new messages only if at bottom (task 4.1)
  useEffect(() => {
    if (!isAtBottomRef.current) return;
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [timeline.length, activeIsWaiting]);

  const totalCount = activeRecords.length + activeInboxMessages.length;

  return (
    <div
      className={cn(
        "flex flex-col h-full rounded-lg border transition-all duration-150 overflow-hidden",
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
            "flex items-center gap-1 px-3 py-2 rounded-t-lg border-b select-none",
            isActive ? "border-primary/40 bg-primary/10" : "border-border/30"
          )}
        >
          {/* Noctis tab */}
          <button
            type="button"
            onClick={() => { onActivate(); onPartyViewChange?.(null); }}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded transition-colors cursor-pointer",
              !viewingComrade
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            )}
          >
            <div className="relative shrink-0">
              {isWaiting && (
                <span className="absolute inset-0 rounded-full animate-ping bg-amber-400/30" />
              )}
              {!imgError ? (
                <img
                  src={imageSrc}
                  alt={label}
                  onError={() => setImgError(true)}
                  className={cn(
                    "h-6 w-auto object-contain transition-all duration-300",
                    isWaiting && "animate-bounce drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]"
                  )}
                />
              ) : (
                <Icon
                  className={cn(
                    "h-4 w-4",
                    !viewingComrade ? "text-primary" : "text-muted-foreground",
                    isWaiting && "animate-bounce text-amber-400"
                  )}
                />
              )}
            </div>
            <span className="text-xs font-medium">{label}</span>
          </button>

          {/* Divider */}
          <div className="h-5 w-px bg-border/30 mx-1 shrink-0" />

          {/* Comrade party tabs */}
          <div className="flex items-center gap-0.5">
            {COMRADES.map((comrade) => (
              <ComradeTab
                key={comrade}
                comrade={comrade}
                cfg={COMRADE_CONFIG[comrade]}
                busy={busyMap?.[comrade] ?? false}
                isSelected={partyView === comrade}
                onClick={() => { onActivate(); onPartyViewChange?.(comrade); }}
              />
            ))}
          </div>

          <span className="ml-auto text-[10px] text-muted-foreground/60 shrink-0">
            {totalCount} msgs
          </span>
        </div>
      ) : (
        /* Standard header (Lunafreya) */
        <button
          type="button"
          onClick={onActivate}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-t-lg border-b cursor-pointer transition-colors select-none",
            isActive
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/30 text-muted-foreground hover:text-foreground hover:bg-white/5"
          )}
        >
          <div className="relative shrink-0">
            {isWaiting && (
              <span className="absolute inset-0 rounded-full animate-ping bg-amber-400/30" />
            )}
            {!imgError ? (
              <img
                src={imageSrc}
                alt={label}
                onError={() => setImgError(true)}
                className={cn(
                  "h-7 w-auto object-contain transition-all duration-300",
                  isWaiting && "animate-bounce drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]"
                )}
              />
            ) : (
              <Icon
                className={cn(
                  "h-4 w-4",
                  isActive ? "text-primary" : "text-muted-foreground",
                  isWaiting && "animate-bounce text-amber-400"
                )}
              />
            )}
          </div>
          <span className="text-sm font-medium">{label}</span>
          <span className="ml-auto text-[10px] text-muted-foreground/60">
            {totalCount} msgs
          </span>
        </button>
      )}

      <ModelSwitchBar
        targetAgent={
          agent === "noctis"
            ? (partyView && (ALL_MODEL_SWITCH_AGENTS as readonly string[]).includes(partyView)
              ? (partyView as ModelSwitchAgent)
              : "noctis")
            : "lunafreya"
        }
        modelOptions={modelOptions}
        isTauri={isTauri}
      />

      {/* Scrollable message list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onClick={onActivate}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3 cursor-pointer"
      >
        {timeline.length === 0 && !activeIsWaiting ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground/60">
            No messages yet
          </div>
        ) : (
          <>
            {timeline.map((item) =>
              item.type === "inbox" ? (
                <InboxBubble key={item.msg.id} msg={item.msg} />
              ) : (
                /* Agent answer — left-aligned with label */
                <div key={item.record.id} className="flex flex-col items-start gap-0.5">
                  <span className="text-[10px] font-semibold text-muted-foreground/60 ml-1">
                    {activeLabel}
                  </span>
                  <div className="w-full">
                    <MessageCard record={item.record} />
                  </div>
                </div>
              )
            )}
            {/* Typing indicator */}
            {activeIsWaiting && <TypingIndicator agentLabel={activeLabel} />}
          </>
        )}
      </div>
    </div>
  );
}

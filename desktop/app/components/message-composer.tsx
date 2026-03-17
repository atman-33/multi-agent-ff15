import { invoke } from "@tauri-apps/api/core";
import { ArrowUp, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildNoctisFormationPreamble,
  DEFAULT_NOCTIS_FORMATION,
  isNoctisFormationId,
  NOCTIS_FORMATION_BY_ID,
  NOCTIS_FORMATION_OPTIONS,
  NOCTIS_FORMATION_STORAGE_KEY,
  type NoctisFormationId,
} from "@/constants/noctis-formation";
import type { AgentId } from "@/hooks/use-agent-chat-log";
import {
  CHAT_DRAFT_UPDATED_EVENT,
  clearChatDraft,
  type DraftTargetAgentId,
  getChatDraftStorageKey,
  readChatDraft,
  setStoredActiveChatTarget,
} from "@/lib/chat-drafts";
import { cn } from "@/lib/utils";

const MIN_ROWS = 2;
const MAX_HEIGHT_PX = 160;
const SLASH_TRIGGER_REGEX = /(?:^|\s)\/(\S*)$/;
const AT_TRIGGER_REGEX = /(?:^|\s)@(\S*)$/;

type SendStatus = "idle" | "sending" | "sent" | "failed";

interface SlashSuggestion {
  insertText?: string;
  label: string;
  source: "command" | "skill";
  value: string;
}

interface AtSuggestion {
  archived?: boolean;
  description?: string;
  insertText: string;
  label: string;
  source: "file" | "folder" | "report";
  value: string;
}

export interface MessageComposerProps {
  compact?: boolean;
  isTauri: boolean;
  onSent?: (agent: AgentId, content: string, id?: string) => void;
  targetAgent: DraftTargetAgentId;
  targetAgentImageSrc?: string;
  targetAgentLabel?: string;
}

function MessageComposer({
  targetAgent,
  isTauri,
  onSent,
  compact = false,
  targetAgentLabel,
  targetAgentImageSrc,
}: MessageComposerProps) {
  const isNoctisTarget = targetAgent === "noctis";
  const storageKey = getChatDraftStorageKey(targetAgent);
  const [content, setContent] = useState(() => {
    if (typeof window !== "undefined") {
      return readChatDraft(targetAgent);
    }
    return "";
  });
  const [projectScopeLabel, setProjectScopeLabel] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      setContent(readChatDraft(targetAgent));
    }
  }, [targetAgent]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.setItem(storageKey, content);
  }, [content, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setStoredActiveChatTarget(targetAgent);
  }, [targetAgent]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleDraftUpdate = (event: Event) => {
      const agent = (event as CustomEvent<{ agent?: string }>).detail?.agent;
      if (agent === targetAgent) {
        setContent(readChatDraft(targetAgent));
      }
    };

    window.addEventListener(CHAT_DRAFT_UPDATED_EVENT, handleDraftUpdate);
    return () => {
      window.removeEventListener(CHAT_DRAFT_UPDATED_EVENT, handleDraftUpdate);
    };
  }, [targetAgent]);

  const [status, setStatus] = useState<SendStatus>("idle");
  const [lastContent, setLastContent] = useState("");
  const [lastAgent, setLastAgent] = useState<DraftTargetAgentId>(targetAgent);
  const [lastFormation, setLastFormation] = useState<NoctisFormationId>(
    DEFAULT_NOCTIS_FORMATION
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noctisFormation, setNoctisFormation] = useState<NoctisFormationId>(
    () => {
      if (typeof window === "undefined") {
        return DEFAULT_NOCTIS_FORMATION;
      }
      const stored = localStorage.getItem(NOCTIS_FORMATION_STORAGE_KEY);
      return stored && isNoctisFormationId(stored)
        ? stored
        : DEFAULT_NOCTIS_FORMATION;
    }
  );

  const [arrowState, setArrowState] = useState<"idle" | "flying" | "done">(
    "idle"
  );

  const [allSlashSuggestions, setAllSlashSuggestions] = useState<
    SlashSuggestion[]
  >([]);
  const [showSlashSuggestions, setShowSlashSuggestions] = useState(false);
  const [allAtSuggestions, setAllAtSuggestions] = useState<AtSuggestion[]>([]);
  const [showAtSuggestions, setShowAtSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    localStorage.setItem(NOCTIS_FORMATION_STORAGE_KEY, noctisFormation);
  }, [noctisFormation]);

  const activeFormation = isNoctisTarget
    ? NOCTIS_FORMATION_BY_ID[noctisFormation]
    : null;
  const showFormationSelector = isNoctisTarget;

  const canSend = content.trim().length > 0 && status !== "sending";

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    const scrollH = el.scrollHeight;
    el.style.height = `${Math.min(scrollH, MAX_HEIGHT_PX)}px`;
    el.style.overflowY = scrollH > MAX_HEIGHT_PX ? "auto" : "hidden";
  });

  const doSend = useCallback(
    async (
      target: DraftTargetAgentId,
      message: string,
      formation: NoctisFormationId = DEFAULT_NOCTIS_FORMATION
    ) => {
      setStatus("sending");
      setArrowState("flying");
      setErrorMsg(null);
      const normalized = message.trim();
      const preamble =
        target === "noctis" ? buildNoctisFormationPreamble(formation) : "";
      const outboundMessage = preamble
        ? `${preamble}\n\n${normalized}`
        : normalized;
      try {
        let messageId: string | undefined;
        if (isTauri) {
          messageId = await invoke<string>("send_crystal_message", {
            target,
            message: outboundMessage,
          });
        } else {
          const res = await fetch(`/api/inbox/${target}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from: "crystal", content: outboundMessage }),
          });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || `HTTP ${res.status}`);
          }
          const data = await res.json();
          messageId = data.id;
        }
        setStatus("sent");
        setContent("");
        clearChatDraft(targetAgent);
        onSent?.(target, outboundMessage, messageId);
        setTimeout(() => setArrowState("done"), 300);
        setTimeout(() => setArrowState("idle"), 1500);
        setTimeout(() => setStatus("idle"), 2000);
      } catch (_e) {
        setStatus("failed");
        setArrowState("idle");
        setErrorMsg(String(_e));
        setLastContent(normalized);
        setLastAgent(target);
        setLastFormation(formation);
      }
    },
    [isTauri, onSent, targetAgent]
  );

  const handleSend = () => doSend(targetAgent, content, noctisFormation);
  const handleRetry = () => doSend(lastAgent, lastContent, lastFormation);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isShowingAny = showSlashSuggestions || showAtSuggestions;
    let currentListLength = 0;
    if (showSlashSuggestions) {
      currentListLength = filteredSlashSuggestions.length;
    } else if (showAtSuggestions) {
      currentListLength = allAtSuggestions.length;
    }

    if (isShowingAny) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) =>
          currentListLength === 0 ? 0 : (prev + 1) % currentListLength
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) =>
          currentListLength === 0
            ? 0
            : (prev - 1 + currentListLength) % currentListLength
        );
        return;
      }
      if (
        (e.key === "Enter" || e.key === "Tab") &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        if (showSlashSuggestions) {
          const selected = filteredSlashSuggestions[selectedSuggestionIndex];
          if (selected) {
            e.preventDefault();
            applySuggestion(selected.insertText ?? selected.value, "/");
            return;
          }
        } else if (showAtSuggestions) {
          const selected = allAtSuggestions[selectedSuggestionIndex];
          if (selected) {
            e.preventDefault();
            applySuggestion(selected.insertText, "@");
            return;
          }
        }
      }
      if (e.key === "Escape") {
        setShowSlashSuggestions(false);
        setShowAtSuggestions(false);
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canSend) {
      e.preventDefault();
      handleSend();
    }
  };

  const activeSlashToken = useMemo(() => {
    const cursor = textareaRef.current?.selectionStart ?? content.length;
    const left = content.slice(0, cursor);
    const slashMatch = left.match(SLASH_TRIGGER_REGEX);
    return slashMatch?.[1] ?? null;
  }, [content]);

  const activeAtToken = useMemo(() => {
    const cursor = textareaRef.current?.selectionStart ?? content.length;
    const left = content.slice(0, cursor);
    const atMatch = left.match(AT_TRIGGER_REGEX);
    return atMatch?.[1] ?? null;
  }, [content]);

  const filteredSlashSuggestions = useMemo(() => {
    if (activeSlashToken === null) {
      return [];
    }
    const keyword = activeSlashToken.toLowerCase();
    return allSlashSuggestions.filter(
      (item) =>
        item.label.toLowerCase().includes(keyword) ||
        item.value.toLowerCase().includes(keyword)
    );
  }, [activeSlashToken, allSlashSuggestions]);

  const reportSuggestions = useMemo(
    () => allAtSuggestions.filter((item) => item.source === "report"),
    [allAtSuggestions]
  );

  const projectSuggestions = useMemo(
    () => allAtSuggestions.filter((item) => item.source !== "report"),
    [allAtSuggestions]
  );

  const applySuggestion = (nextValue: string, trigger: "/" | "@") => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setContent((prev) => `${prev} ${nextValue}`.trimStart());
      trigger === "/"
        ? setShowSlashSuggestions(false)
        : setShowAtSuggestions(false);
      return;
    }

    const cursor = textarea.selectionStart;
    const left = content.slice(0, cursor);
    const right = content.slice(cursor);
    const regex = trigger === "/" ? SLASH_TRIGGER_REGEX : AT_TRIGGER_REGEX;

    const replacedLeft = left.replace(regex, (match) => {
      const leadingSpace = match.startsWith(" ") ? " " : "";
      return `${leadingSpace}${nextValue}`;
    });

    const nextContent = `${replacedLeft}${right}${right.startsWith(" ") || right.length === 0 ? "" : " "}`;
    setContent(nextContent);
    trigger === "/"
      ? setShowSlashSuggestions(false)
      : setShowAtSuggestions(false);

    requestAnimationFrame(() => {
      const nextCursor = replacedLeft.length;
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  useEffect(() => {
    let mounted = true;
    const loadSlashSuggestions = async () => {
      try {
        const res = await fetch("/api/slash-suggestions");
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        if (mounted && Array.isArray(data?.suggestions)) {
          setAllSlashSuggestions(data.suggestions);
        }
      } catch (_e) {
        _e;
      }
    };
    loadSlashSuggestions();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (activeAtToken === null) {
      setAllAtSuggestions([]);
      setShowAtSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/at-suggestions?q=${encodeURIComponent(activeAtToken)}&agent=${encodeURIComponent(targetAgent)}`
        );
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        if (Array.isArray(data?.suggestions)) {
          setAllAtSuggestions(data.suggestions);
          setProjectScopeLabel(
            typeof data.projectScopeLabel === "string"
              ? data.projectScopeLabel
              : null
          );
          setShowAtSuggestions(data.suggestions.length > 0);
          setSelectedSuggestionIndex(0);
        }
      } catch (_e) {
        _e;
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [activeAtToken, targetAgent]);

  useEffect(() => {
    const shouldShow =
      activeSlashToken !== null && filteredSlashSuggestions.length > 0;
    setShowSlashSuggestions(shouldShow);
    if (shouldShow) {
      setSelectedSuggestionIndex(0);
    }
  }, [activeSlashToken, filteredSlashSuggestions.length]);

  return (
    <div
      className={cn(
        "border-border/30 border-t",
        compact ? "px-2 pt-2 pb-2" : "px-3 pt-3 pb-3"
      )}
    >
      <div className="mb-1 flex min-h-[16px] items-center gap-2 text-[10px]">
        {targetAgentLabel && (
          <div className="flex items-center gap-1">
            <span className="font-medium text-[9px] text-muted-foreground/40 uppercase tracking-wide">
              TO
            </span>
            {targetAgentImageSrc && (
              <img
                alt={targetAgentLabel}
                className="h-3.5 w-auto object-contain opacity-60"
                src={targetAgentImageSrc}
              />
            )}
            <span className="font-medium text-muted-foreground/70">
              {targetAgentLabel}
            </span>
          </div>
        )}
        {status === "sent" && (
          <span className="ml-auto flex items-center gap-1 text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            Sent
          </span>
        )}
        {status === "failed" && (
          <>
            <span className="ml-auto flex items-center gap-1 text-red-400">
              <XCircle className="h-3 w-3 shrink-0" />
              Failed: {errorMsg}
            </span>
            <button
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-red-400 hover:bg-red-500/10"
              onClick={handleRetry}
              type="button"
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
          </>
        )}
      </div>

      {showFormationSelector && (
        <div className="mb-2 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 font-medium text-[9px] text-muted-foreground/40 uppercase tracking-wide">
              Formation
            </span>
            {NOCTIS_FORMATION_OPTIONS.map((option) => {
              const isSelected = option.id === noctisFormation;
              return (
                <button
                  className={cn(
                    "rounded-full border px-2 py-1 text-[10px] transition-colors",
                    isSelected
                      ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-100"
                      : "border-border/40 bg-background/40 text-muted-foreground/70 hover:border-border/70 hover:text-foreground"
                  )}
                  key={option.id}
                  onClick={() => setNoctisFormation(option.id)}
                  type="button"
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {activeFormation &&
            activeFormation.id !== DEFAULT_NOCTIS_FORMATION && (
              <div className="rounded-md border border-indigo-400/20 bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-100/90">
                <span className="font-medium text-indigo-100">
                  Execution mode:
                </span>{" "}
                {activeFormation.summary}
              </div>
            )}
        </div>
      )}

      <div className="relative">
        <textarea
          className={cn(
            "w-full resize-none rounded-xl border bg-background/60 py-2 pr-12 pl-3 text-xs leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm",
            "focus:outline-none focus:ring-1 focus:ring-ring",
            "placeholder:text-muted-foreground/40",
            "border-border/40"
          )}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message… (Ctrl+Enter to send)"
          ref={textareaRef}
          rows={MIN_ROWS}
          value={content}
        />

        <button
          className={cn(
            "absolute right-1 bottom-2.5 flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-md transition-all duration-200 ease-out",
            canSend
              ? arrowState === "done"
                ? "border-emerald-400/30 bg-emerald-500/14 text-emerald-50 shadow-[0_10px_24px_rgba(6,78,59,0.28),inset_0_1px_0_rgba(255,255,255,0.08)]"
                : "border-indigo-400/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(99,102,241,0.14))] text-slate-100 shadow-[0_10px_28px_rgba(2,6,23,0.38),0_0_0_1px_rgba(99,102,241,0.06),inset_0_1px_0_rgba(255,255,255,0.12)] hover:border-indigo-300/35 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(129,140,248,0.2))] hover:text-white hover:shadow-[0_14px_32px_rgba(2,6,23,0.45),0_0_18px_rgba(99,102,241,0.12),inset_0_1px_0_rgba(255,255,255,0.16)] active:translate-y-[1px]"
              : "cursor-not-allowed border-border/40 bg-background/45 text-muted-foreground/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          )}
          disabled={!canSend}
          onClick={handleSend}
          title="Send (Ctrl+Enter)"
          type="button"
        >
          {arrowState === "done" ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <div className="relative flex h-3.5 w-3.5 items-center justify-center overflow-hidden">
              <ArrowUp
                className={cn(
                  "absolute h-3.5 w-3.5 transition-all duration-300",
                  arrowState === "flying"
                    ? "-translate-y-6 opacity-0"
                    : "translate-y-0 opacity-100"
                )}
              />
              <ArrowUp
                className={cn(
                  "absolute h-3.5 w-3.5 transition-all duration-300",
                  arrowState === "flying"
                    ? "-translate-y-3 opacity-100"
                    : "translate-y-3 opacity-0"
                )}
              />
            </div>
          )}
        </button>

        {showSlashSuggestions && (
          <div className="absolute right-0 bottom-[calc(100%+8px)] left-0 z-20 max-h-40 overflow-y-auto rounded-md border border-border/60 bg-background/95 shadow-lg backdrop-blur-sm">
            {filteredSlashSuggestions.map((item, idx) => (
              <button
                className={cn(
                  "w-full px-3 py-2 text-left text-xs hover:bg-accent/70",
                  idx === selectedSuggestionIndex && "bg-accent"
                )}
                key={`${item.source}-${item.value}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(item.insertText ?? item.value, "/");
                }}
                type="button"
              >
                <span className="font-medium text-foreground">
                  {item.value}
                </span>
                <span className="ml-2 text-muted-foreground">
                  ({item.label})
                </span>
              </button>
            ))}
          </div>
        )}

        {showAtSuggestions && (
          <div className="absolute right-0 bottom-[calc(100%+8px)] left-0 z-20 max-h-60 overflow-y-auto rounded-md border border-border/60 bg-background/95 shadow-lg backdrop-blur-sm">
            <div className="border-border/40 border-b bg-muted/30 px-2 py-1.5 font-semibold text-[10px] text-muted-foreground">
              REFERENCES
            </div>
            {reportSuggestions.length > 0 && (
              <div className="border-border/30 border-b bg-amber-500/5 px-2 py-1 font-semibold text-[10px] text-amber-700 uppercase tracking-wide dark:text-amber-300">
                Reports
              </div>
            )}
            {allAtSuggestions.map((item, idx) => (
              <button
                className={cn(
                  "flex w-full flex-col gap-0.5 px-3 py-2 text-left text-xs hover:bg-accent/70",
                  idx === selectedSuggestionIndex && "bg-accent"
                )}
                key={`${item.source}-${item.value}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(item.insertText, "@");
                }}
                type="button"
              >
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-foreground">
                    {item.label}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 font-semibold text-[9px] uppercase tracking-wide",
                      item.source === "report"
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {item.source === "report"
                      ? item.archived
                        ? "Archived Report"
                        : "Report"
                      : item.source}
                  </span>
                </div>
                {item.description && (
                  <span className="truncate text-[10px] text-muted-foreground">
                    {item.description}
                  </span>
                )}
                <span className="truncate text-[10px] text-muted-foreground/80">
                  {item.value}
                </span>
              </button>
            ))}
            {projectSuggestions.length > 0 && projectScopeLabel && (
              <div className="border-border/30 border-t bg-muted/20 px-3 py-1 text-[10px] text-muted-foreground">
                Project file results are limited to the current{" "}
                {projectScopeLabel} scope.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MessageComposer);

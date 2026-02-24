import { invoke } from "@tauri-apps/api/core";
import { ArrowUp, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentId } from "@/lib/use-agent-chat-log";
import { cn } from "@/lib/utils";

const MAX_MESSAGE_LENGTH = 4000;
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
  insertText: string;
  label: string;
  source: "file" | "folder";
  value: string;
}

export interface MessageComposerProps {
  targetAgent: AgentId;
  isTauri: boolean;
  onSent?: (agent: AgentId, content: string, id?: string) => void;
  compact?: boolean;
}

function MessageComposer({
  targetAgent,
  isTauri,
  onSent,
  compact = false,
}: MessageComposerProps) {
  const storageKey = `chat_draft_${targetAgent}`;
  const [content, setContent] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(storageKey) || "";
    }
    return "";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      setContent(localStorage.getItem(storageKey) || "");
    }
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, content);
  }, [content, storageKey]);

  const [status, setStatus] = useState<SendStatus>("idle");
  const [lastContent, setLastContent] = useState("");
  const [lastAgent, setLastAgent] = useState<AgentId>(targetAgent);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const charCount = content.length;
  const isOverLimit = charCount > MAX_MESSAGE_LENGTH;
  const canSend =
    content.trim().length > 0 && !isOverLimit && status !== "sending";

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
    async (target: AgentId, message: string) => {
      setStatus("sending");
      setArrowState("flying");
      setErrorMsg(null);
      try {
        let messageId: string | undefined;
        if (isTauri) {
          messageId = await invoke<string>("send_crystal_message", {
            target,
            message: message.trim(),
          });
        } else {
          const res = await fetch(`/api/inbox/${target}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from: "crystal", content: message.trim() }),
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
        localStorage.removeItem(storageKey);
        onSent?.(target, message.trim(), messageId);
        setTimeout(() => setArrowState("done"), 300);
        setTimeout(() => setArrowState("idle"), 1500);
        setTimeout(() => setStatus("idle"), 2000);
      } catch (_e) {
        setStatus("failed");
        setArrowState("idle");
        setErrorMsg(String(_e));
        setLastContent(message);
        setLastAgent(target);
      }
    },
    [isTauri, onSent, storageKey]
  );

  const handleSend = () => doSend(targetAgent, content);
  const handleRetry = () => doSend(lastAgent, lastContent);

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
          `/api/at-suggestions?q=${encodeURIComponent(activeAtToken)}`
        );
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        if (Array.isArray(data?.suggestions)) {
          setAllAtSuggestions(data.suggestions);
          setShowAtSuggestions(data.suggestions.length > 0);
          setSelectedSuggestionIndex(0);
        }
      } catch (_e) {
        _e;
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [activeAtToken]);

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
        {status === "sent" && (
          <span className="flex items-center gap-1 text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            Sent
          </span>
        )}
        {status === "failed" && (
          <>
            <span className="flex items-center gap-1 text-red-400">
              <XCircle className="h-3 w-3 shrink-0" />
              Failed: {errorMsg}
            </span>
            <button
              className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-red-400 hover:bg-red-500/10"
              onClick={handleRetry}
              type="button"
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
          </>
        )}
        {status === "idle" && isOverLimit && (
          <span className="text-red-400">
            {charCount}/{MAX_MESSAGE_LENGTH}
          </span>
        )}
      </div>

      <div className="relative">
        <textarea
          className={cn(
            "w-full resize-none rounded-xl border bg-background/60 py-2 pr-11 pl-3 text-xs leading-relaxed",
            "focus:outline-none focus:ring-1 focus:ring-ring",
            "placeholder:text-muted-foreground/40",
            isOverLimit ? "border-red-500/60" : "border-border/40"
          )}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message… (Ctrl+Enter to send)"
          ref={textareaRef}
          rows={MIN_ROWS}
          value={content}
        />

        {charCount > 0 && (
          <span
            className={cn(
              "pointer-events-none absolute right-11 bottom-2 text-[9px]",
              isOverLimit ? "text-red-400" : "text-muted-foreground/30"
            )}
          >
            {charCount}/{MAX_MESSAGE_LENGTH}
          </span>
        )}

        <button
          className={cn(
            "absolute right-2 bottom-2 flex h-7 w-7 items-center justify-center rounded-full transition-all duration-200",
            canSend
              ? arrowState === "done"
                ? "bg-green-500/80 text-white shadow-sm"
                : "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
              : "cursor-not-allowed bg-muted/40 text-muted-foreground/40"
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
              FILES & FOLDERS
            </div>
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
                <span className="truncate font-medium text-foreground">
                  {item.label}
                </span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {item.value}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MessageComposer);

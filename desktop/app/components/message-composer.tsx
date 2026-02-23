import { invoke } from "@tauri-apps/api/core";
import {
  CheckCircle2,
  Crown,
  Moon,
  RotateCcw,
  Send,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MainAgentId } from "@/lib/use-agent-chat-log";
import { cn } from "@/lib/utils";

const MAX_MESSAGE_LENGTH = 4000;
const SLASH_TRIGGER_REGEX = /(?:^|\s)\/\S*$/;
const AT_TRIGGER_REGEX = /(?:^|\s)@\S*$/;

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

interface MessageComposerProps {
  activeAgent: MainAgentId;
  isTauri: boolean;
  onSent?: (agent: MainAgentId, content: string, id?: string) => void;
}

const AGENT_CONFIG: Record<
  MainAgentId,
  { label: string; Icon: React.ElementType; placeholder: string }
> = {
  noctis: {
    label: "Noctis",
    Icon: Crown,
    placeholder: "Message to Noctis…",
  },
  lunafreya: {
    label: "Lunafreya",
    Icon: Moon,
    placeholder: "Message to Lunafreya…",
  },
};

export default function MessageComposer({
  activeAgent,
  isTauri,
  onSent,
}: MessageComposerProps) {
  const [content, setContent] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("chat_draft_content") || "";
    }
    return "";
  });

  // Save draft to local storage on content change
  useEffect(() => {
    localStorage.setItem("chat_draft_content", content);
  }, [content]);
  const [status, setStatus] = useState<SendStatus>("idle");
  const [lastContent, setLastContent] = useState("");
  const [lastAgent, setLastAgent] = useState<MainAgentId>(activeAgent);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [allSlashSuggestions, setAllSlashSuggestions] = useState<
    SlashSuggestion[]
  >([]);
  const [showSlashSuggestions, setShowSlashSuggestions] = useState(false);
  const [allAtSuggestions, setAllAtSuggestions] = useState<AtSuggestion[]>([]);
  const [showAtSuggestions, setShowAtSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { label, Icon, placeholder } = AGENT_CONFIG[activeAgent];
  const charCount = content.length;
  const isOverLimit = charCount > MAX_MESSAGE_LENGTH;
  const canSend =
    content.trim().length > 0 && !isOverLimit && status !== "sending";

  const doSend = useCallback(
    async (target: MainAgentId, message: string) => {
      setStatus("sending");
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
        onSent?.(target, message.trim(), messageId);
        // Auto-clear "sent" badge after 2 s
        setTimeout(() => setStatus("idle"), 2000);
      } catch (_e) {
        setStatus("failed");
        setErrorMsg(String(_e));
        setLastContent(message);
        setLastAgent(target);
      }
    },
    [isTauri, onSent]
  );

  const handleSend = () => doSend(activeAgent, content);

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

    // Ctrl+Enter or Cmd+Enter to send
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
        // Non-blocking helper endpoint
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
        // ignore
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
    <div className="space-y-3 border-border/40 border-t pt-3">
      <div className="flex items-center gap-2 px-1 text-muted-foreground text-xs">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span>
          To: <span className="font-semibold text-foreground">{label}</span>
        </span>

        {status === "sent" && (
          <span className="ml-auto flex items-center gap-1 text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Sent
          </span>
        )}
        {status === "failed" && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-red-400">
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            Send failed: {errorMsg}
          </span>
        )}
      </div>

      {/* Retry button (task 4.7) */}
      {status === "failed" && (
        <Button
          className="h-7 gap-1 text-red-400 text-xs hover:bg-red-500/10 hover:text-red-300"
          onClick={handleRetry}
          size="sm"
          variant="ghost"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Retry
        </Button>
      )}

      {/* Input area */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <textarea
            className={cn(
              "w-full resize-none rounded-md border bg-background/60 px-3 py-2 text-sm",
              "focus:outline-none focus:ring-1 focus:ring-ring",
              "placeholder:text-muted-foreground/50",
              isOverLimit ? "border-red-500/60" : "border-border/50"
            )}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            ref={textareaRef}
            rows={7}
            value={content}
          />
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
          {/* Character count */}
          <span
            className={cn(
              "absolute right-2 bottom-2 text-[10px]",
              isOverLimit ? "text-red-400" : "text-muted-foreground/40"
            )}
          >
            {charCount}/{MAX_MESSAGE_LENGTH}
          </span>
        </div>

        <Button
          className="h-9 w-9 shrink-0 self-end"
          disabled={!canSend}
          onClick={handleSend}
          size="icon"
          title={`Send (Ctrl+Enter) → ${label}`}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

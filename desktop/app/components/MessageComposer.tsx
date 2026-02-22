import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Send, RotateCcw, Crown, Moon, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MainAgentId } from "@/lib/useAgentChatLog";

const MAX_MESSAGE_LENGTH = 4000;

type SendStatus = "idle" | "sending" | "sent" | "failed";
type ModelSwitchAgent = "noctis" | "lunafreya" | "ignis" | "gladiolus" | "prompto";

type SlashSuggestion = {
  label: string;
  value: string;
  source: "command" | "skill";
};

interface MessageComposerProps {
  activeAgent: MainAgentId;
  isTauri: boolean;
  onSent?: (agent: MainAgentId, content: string) => void;
}

const AGENT_CONFIG: Record<MainAgentId, { label: string; Icon: React.ElementType; placeholder: string }> = {
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

const MODEL_SWITCH_AGENTS: Array<{ value: ModelSwitchAgent; label: string }> = [
  { value: "noctis", label: "Noctis" },
  { value: "lunafreya", label: "Lunafreya" },
  { value: "ignis", label: "Ignis" },
  { value: "gladiolus", label: "Gladiolus" },
  { value: "prompto", label: "Prompto" },
];

export default function MessageComposer({ activeAgent, isTauri, onSent }: MessageComposerProps) {
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<SendStatus>("idle");
  const [lastContent, setLastContent] = useState("");
  const [lastAgent, setLastAgent] = useState<MainAgentId>(activeAgent);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [allSlashSuggestions, setAllSlashSuggestions] = useState<SlashSuggestion[]>([]);
  const [showSlashSuggestions, setShowSlashSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelSwitchAgent, setModelSwitchAgent] = useState<ModelSwitchAgent>("noctis");
  const [modelLabel, setModelLabel] = useState("");

  const { label, Icon, placeholder } = AGENT_CONFIG[activeAgent];
  const charCount = content.length;
  const isOverLimit = charCount > MAX_MESSAGE_LENGTH;
  const canSend =
    content.trim().length > 0 && !isOverLimit && status !== "sending";

  const selectedModelLabel = useMemo(
    () => (modelOptions.includes(modelLabel) ? modelLabel : ""),
    [modelLabel, modelOptions]
  );

  useEffect(() => {
    let cancelled = false;

    const loadModelOptions = async () => {
      try {
        if (isTauri) {
          const options = await invoke<string[]>("read_model_options");
          if (!cancelled) {
            setModelOptions(options);
            if (!modelLabel && options.length > 0) {
              setModelLabel(options[0]);
            }
          }
          return;
        }

        const res = await fetch("/api/model-options");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = (await res.json()) as { modelOptions?: string[] };
        const options = Array.isArray(data.modelOptions) ? data.modelOptions : [];
        if (!cancelled) {
          setModelOptions(options);
          if (!modelLabel && options.length > 0) {
            setModelLabel(options[0]);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setModelOptions([]);
          setModelLabel("");
          toast.error(`Failed to load model options: ${String(e)}`);
        }
      }
    };

    void loadModelOptions();
    return () => {
      cancelled = true;
    };
  }, [isTauri]);

  const doSend = useCallback(
    async (target: MainAgentId, message: string) => {
      setStatus("sending");
      setErrorMsg(null);
      try {
        if (isTauri) {
          await invoke("send_crystal_message", { target, message: message.trim() });
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
        }
        setStatus("sent");
        setContent("");
        onSent?.(target, message.trim());
        // Auto-clear "sent" badge after 2 s
        setTimeout(() => setStatus("idle"), 2_000);
      } catch (e) {
        setStatus("failed");
        setErrorMsg(String(e));
        setLastContent(message);
        setLastAgent(target);
      }
    },
    [isTauri, onSent]
  );

  const switchModel = useCallback(async () => {
    if (!modelLabel) {
      toast.error("Model is required");
      return;
    }

    try {
      if (isTauri) {
        await invoke("switch_agent_model", { agent: modelSwitchAgent, label: modelLabel });
      } else {
        const res = await fetch("/api/model-switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent: modelSwitchAgent, label: modelLabel }),
        });

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error || `HTTP ${res.status}`);
        }
      }

      toast.success(`Switched ${modelSwitchAgent} to ${selectedModelLabel || modelLabel}`);
    } catch (e) {
      toast.error(`Model switch failed: ${String(e)}`);
    }
  }, [isTauri, modelLabel, modelSwitchAgent, selectedModelLabel]);

  const handleSend = () => doSend(activeAgent, content);

  const handleRetry = () => doSend(lastAgent, lastContent);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlashSuggestions) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) =>
          filteredSlashSuggestions.length === 0
            ? 0
            : (prev + 1) % filteredSlashSuggestions.length
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) =>
          filteredSlashSuggestions.length === 0
            ? 0
            : (prev - 1 + filteredSlashSuggestions.length) % filteredSlashSuggestions.length
        );
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const selected = filteredSlashSuggestions[selectedSuggestionIndex];
        if (selected) {
          e.preventDefault();
          applySlashSuggestion(selected.value);
          return;
        }
      }
      if (e.key === "Escape") {
        setShowSlashSuggestions(false);
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
    const slashMatch = left.match(/(?:^|\s)\/(\S*)$/);
    return slashMatch?.[1] ?? null;
  }, [content]);

  const filteredSlashSuggestions = useMemo(() => {
    if (activeSlashToken === null) {
      return [];
    }

    const keyword = activeSlashToken.toLowerCase();
    return allSlashSuggestions.filter(
      (item) => item.label.toLowerCase().includes(keyword) || item.value.toLowerCase().includes(keyword)
    );
  }, [activeSlashToken, allSlashSuggestions]);

  const applySlashSuggestion = (nextValue: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setContent((prev) => `${prev} ${nextValue}`.trimStart());
      setShowSlashSuggestions(false);
      return;
    }

    const cursor = textarea.selectionStart;
    const left = content.slice(0, cursor);
    const right = content.slice(cursor);
    const replacedLeft = left.replace(/(?:^|\s)\/\S*$/, (match) => {
      const leadingSpace = match.startsWith(" ") ? " " : "";
      return `${leadingSpace}${nextValue}`;
    });

    const nextContent = `${replacedLeft}${right}${right.startsWith(" ") || right.length === 0 ? "" : " "}`;
    setContent(nextContent);
    setShowSlashSuggestions(false);

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
      } catch {
        // Non-blocking helper endpoint
      }
    };

    loadSlashSuggestions();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const shouldShow = activeSlashToken !== null && filteredSlashSuggestions.length > 0;
    setShowSlashSuggestions(shouldShow);
    setSelectedSuggestionIndex(0);
  }, [activeSlashToken, filteredSlashSuggestions.length]);

  return (
    <div className="border-t border-border/40 pt-3 space-y-3">
      <div className="rounded-md border border-border/40 px-3 py-2 space-y-2">
        <div className="text-xs text-muted-foreground">Temporary model switch</div>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <label className="text-[11px] text-muted-foreground">
            Agent
            <select
              value={modelSwitchAgent}
              onChange={(e) => setModelSwitchAgent(e.target.value as ModelSwitchAgent)}
              className="mt-1 w-full rounded-md border border-border/50 bg-background/60 px-2 py-1.5 text-xs"
            >
              {MODEL_SWITCH_AGENTS.map((agent) => (
                <option key={agent.value} value={agent.value}>
                  {agent.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[11px] text-muted-foreground">
            Model
            <select
              value={modelLabel}
              onChange={(e) => setModelLabel(e.target.value)}
              className="mt-1 w-full rounded-md border border-border/50 bg-background/60 px-2 py-1.5 text-xs"
            >
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>

          <Button
            type="button"
            variant="secondary"
            onClick={switchModel}
            disabled={!modelLabel || modelOptions.length === 0}
            className="h-8 text-xs"
          >
            Apply
          </Button>
        </div>
      </div>

      {/* To: indicator (task 4.4 – always visible) */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span>
          To: <span className="font-semibold text-foreground">{label}</span>
        </span>

        {/* Send status (task 4.7) */}
        {status === "sent" && (
          <span className="ml-auto flex items-center gap-1 text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Sent
          </span>
        )}
        {status === "failed" && (
          <span className="ml-auto flex items-center gap-1 text-red-400 text-[11px]">
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            Send failed: {errorMsg}
          </span>
        )}
      </div>

      {/* Retry button (task 4.7) */}
      {status === "failed" && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRetry}
          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 text-xs gap-1"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Retry
        </Button>
      )}

      {/* Input area */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={7}
            className={cn(
              "w-full resize-none rounded-md border bg-background/60 px-3 py-2 text-sm",
              "focus:outline-none focus:ring-1 focus:ring-ring",
              "placeholder:text-muted-foreground/50",
              isOverLimit ? "border-red-500/60" : "border-border/50"
            )}
          />
          {showSlashSuggestions && (
            <div className="absolute left-0 right-0 bottom-[calc(100%+8px)] max-h-40 overflow-y-auto rounded-md border border-border/60 bg-background/95 shadow-lg backdrop-blur-sm z-20">
              {filteredSlashSuggestions.map((item, idx) => (
                <button
                  key={`${item.source}-${item.value}`}
                  type="button"
                  className={cn(
                    "w-full px-3 py-2 text-left text-xs hover:bg-accent/70",
                    idx === selectedSuggestionIndex && "bg-accent"
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applySlashSuggestion(item.value);
                  }}
                >
                  <span className="font-medium text-foreground">{item.value}</span>
                  <span className="ml-2 text-muted-foreground">({item.label})</span>
                </button>
              ))}
            </div>
          )}
          {/* Character count */}
          <span
            className={cn(
              "absolute bottom-2 right-2 text-[10px]",
              isOverLimit ? "text-red-400" : "text-muted-foreground/40"
            )}
          >
            {charCount}/{MAX_MESSAGE_LENGTH}
          </span>
        </div>

        <Button
          onClick={handleSend}
          disabled={!canSend}
          size="icon"
          className="self-end h-9 w-9 shrink-0"
          title={`Send (Ctrl+Enter) → ${label}`}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

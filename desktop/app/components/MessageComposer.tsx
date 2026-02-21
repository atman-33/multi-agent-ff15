import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { Send, RotateCcw, Crown, Moon, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentId } from "@/lib/useAgentChatLog";

const MAX_MESSAGE_LENGTH = 4000;

type SendStatus = "idle" | "sending" | "sent" | "failed";

interface MessageComposerProps {
  activeAgent: AgentId;
  isTauri: boolean;
}

const AGENT_CONFIG: Record<AgentId, { label: string; Icon: React.ElementType; placeholder: string }> = {
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

export default function MessageComposer({ activeAgent, isTauri }: MessageComposerProps) {
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<SendStatus>("idle");
  const [lastContent, setLastContent] = useState("");
  const [lastAgent, setLastAgent] = useState<AgentId>(activeAgent);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { label, Icon, placeholder } = AGENT_CONFIG[activeAgent];
  const charCount = content.length;
  const isOverLimit = charCount > MAX_MESSAGE_LENGTH;
  const canSend =
    isTauri && content.trim().length > 0 && !isOverLimit && status !== "sending";

  const doSend = useCallback(
    async (target: AgentId, message: string) => {
      if (!isTauri) return;
      setStatus("sending");
      setErrorMsg(null);
      try {
        await invoke("send_crystal_message", { target, message: message.trim() });
        setStatus("sent");
        setContent("");
        // Auto-clear "sent" badge after 2 s
        setTimeout(() => setStatus("idle"), 2_000);
      } catch (e) {
        setStatus("failed");
        setErrorMsg(String(e));
        setLastContent(message);
        setLastAgent(target);
      }
    },
    [isTauri]
  );

  const handleSend = () => doSend(activeAgent, content);

  const handleRetry = () => doSend(lastAgent, lastContent);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter or Cmd+Enter to send
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canSend) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border/40 pt-3 space-y-2">
      {/* To: indicator (task 4.4 – always visible) */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span>
          To:{" "}
          <span className="font-semibold text-foreground">{label}</span>
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

import { MessagesSquare } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ChatThreadFrame } from "@/components/chat/thread-frame";
import { NEW_OPENCODE_SESSION_DRAFT_KEY } from "@/lib/opencode-session";
import type { PromptPart } from "@/lib/prompt-parts";
import { useChatStore } from "@/stores/chat-store";
import MessageComposer from "../_layout.opencode.session.$id/components/message-composer";

const OpenCodeIndex = () => {
  const navigate = useNavigate();
  const [isStarting, setIsStarting] = useState(false);

  const selectedAgent = useChatStore((state) => state.selectedAgent);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const clearSessionDraft = useChatStore((state) => state.clearSessionDraft);
  const setOptimisticSessionState = useChatStore((state) => state.setOptimisticSessionState);

  const handleSend = useCallback(
    async (parts: PromptPart[], options?: { agent?: string | null }) => {
      if (isStarting) {
        return;
      }

      setIsStarting(true);

      try {
        const response = await fetch("/api/opencode/session/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parts,
            model: selectedModel ?? undefined,
            agent: options?.agent ?? selectedAgent ?? undefined,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to start session");
        }

        const data = (await response.json()) as {
          session?: {
            id?: string;
          };
        };

        const sessionId = data.session?.id;
        if (!sessionId) {
          throw new Error("Session creation returned no ID");
        }

        clearSessionDraft(NEW_OPENCODE_SESSION_DRAFT_KEY);
        setOptimisticSessionState(sessionId, "busy");

        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("sessions:refresh"));
        }

        navigate(`/opencode/session/${sessionId}`);
      } catch {
        toast.error("Unable to start session", {
          description: "OpenCode server not available",
        });
      } finally {
        setIsStarting(false);
      }
    },
    [clearSessionDraft, isStarting, navigate, selectedAgent, selectedModel, setOptimisticSessionState]
  );

  return (
    <ChatThreadFrame
      outerClassName="flex h-full flex-col"
      resetKey={NEW_OPENCODE_SESSION_DRAFT_KEY}
      footer={
        <MessageComposer
          sessionId={NEW_OPENCODE_SESSION_DRAFT_KEY}
          onSend={handleSend}
          disabled={isStarting}
          placeholder="Start a new OpenCode session"
        />
      }
    >
      {() => (
        <div className="flex min-h-full flex-col items-center justify-center gap-3 text-muted-foreground">
          <MessagesSquare className="h-10 w-10 opacity-20" />
          <p className="text-sm">Start typing below to create a new session.</p>
        </div>
      )}
    </ChatThreadFrame>
  );
};

export default OpenCodeIndex;

import { MessagesSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ChatThreadFrame } from "@/components/chat/thread-frame";
import { useProjectRegistry } from "@/hooks/use-project-registry";
import {
  APP_ROOT_EXECUTION_PROJECT_ID,
  APP_ROOT_EXECUTION_PROJECT_LABEL,
  normalizeContextProjectIds,
} from "@/lib/execution-context";
import { NEW_OPENCODE_SESSION_DRAFT_KEY } from "@/lib/opencode-session";
import type { PromptPart } from "@/lib/prompt-parts";
import { useChatStore } from "@/stores/chat-store";
import MessageComposer from "../_layout.opencode.session.$id/components/message-composer";

const OpenCodeIndex = () => {
  const navigate = useNavigate();
  const [isStarting, setIsStarting] = useState(false);
  const [selectedExecutionProjectId, setSelectedExecutionProjectId] = useState(
    APP_ROOT_EXECUTION_PROJECT_ID,
  );
  const [selectedContextProjectIds, setSelectedContextProjectIds] = useState<string[]>([]);
  const { data: projectRegistryData } = useProjectRegistry();

  const selectedAgent = useChatStore((state) => state.selectedAgent);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const clearSessionDraft = useChatStore((state) => state.clearSessionDraft);
  const setOptimisticSessionState = useChatStore((state) => state.setOptimisticSessionState);
  const registeredProjects = projectRegistryData?.projects ?? [];
  const executionProjectOptions = useMemo(
    () => [
      { value: APP_ROOT_EXECUTION_PROJECT_ID, label: APP_ROOT_EXECUTION_PROJECT_LABEL },
      ...registeredProjects.map((project) => ({ value: project.id, label: project.displayName })),
    ],
    [registeredProjects],
  );
  const contextProjectOptions = useMemo(
    () =>
      registeredProjects
        .filter((project) => project.id !== selectedExecutionProjectId)
        .map((project) => ({ value: project.id, label: project.displayName })),
    [registeredProjects, selectedExecutionProjectId],
  );

  useEffect(() => {
    setSelectedContextProjectIds((current) =>
      normalizeContextProjectIds(selectedExecutionProjectId, current),
    );
  }, [selectedExecutionProjectId]);

  const toggleContextProjectId = useCallback((projectId: string) => {
    setSelectedContextProjectIds((current) =>
      current.includes(projectId)
        ? current.filter((entry) => entry !== projectId)
        : [...current, projectId],
    );
  }, []);

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
            executionProjectId: selectedExecutionProjectId,
            contextProjectIds: selectedContextProjectIds,
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
    [
      clearSessionDraft,
      isStarting,
      navigate,
      selectedAgent,
      selectedContextProjectIds,
      selectedExecutionProjectId,
      selectedModel,
      setOptimisticSessionState,
    ]
  );

  return (
    <ChatThreadFrame
      outerClassName="flex h-full flex-col"
      resetKey={NEW_OPENCODE_SESSION_DRAFT_KEY}
      footer={
        <MessageComposer
          sessionId={NEW_OPENCODE_SESSION_DRAFT_KEY}
          executionProjectOptions={executionProjectOptions}
          selectedExecutionProjectId={selectedExecutionProjectId}
          onSelectedExecutionProjectChange={setSelectedExecutionProjectId}
          contextProjectOptions={contextProjectOptions}
          selectedContextProjectIds={selectedContextProjectIds}
          onToggleContextProjectId={toggleContextProjectId}
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

import { Terminal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router";
import { toast } from "sonner";
import { ChatThreadFrame } from "@/components/chat/thread-frame";
import { Button } from "@/components/ui/button";
import { useConversationUnitInspectability } from "@/hooks/use-conversation-unit-inspectability";
import { useProjectRegistry } from "@/hooks/use-project-registry";
import { useSessionChatRenderSnapshot } from "@/hooks/use-session-chat-render-snapshot";
import { useSessionLiveThread } from "@/hooks/use-session-live-thread";
import {
  APP_ROOT_EXECUTION_PROJECT_ID,
  APP_ROOT_EXECUTION_PROJECT_LABEL,
} from "@/lib/execution-context";
import { fetchSessionStatus, isSessionStatusActive } from "@/lib/session-status";
import { mergeMessageInfoText } from "@/lib/session-stream";
import { toSessionPresentationMessages } from "@/lib/session-message-presentation";
import { useChatStore } from "@/stores/chat-store";
import type { OpenCodeOutletContext } from "../_layout.opencode/route";
import type { Route } from "./+types/route";
import MessageComposer from "./components/message-composer";
import MessageList from "./components/message-list";
import type { MessageInfo } from "./types";

type SessionExecutionContext = {
  executionProjectId: string;
  contextProjectIds: string[];
  updatedAt: string | null;
};

type ManagedSessionInfo = {
  missionId: string;
  missionTitle: string;
  ownerAgent: string;
  ownerLabel: string;
};

const SessionRoute = ({ loaderData }: Route.ComponentProps) => {
  const params = useParams();
  const navigate = useNavigate();
  const sessionId = params.id ?? null;
  const { sessions } = useOutletContext<OpenCodeOutletContext>();
  const [messages, setMessages] = useState<MessageInfo[]>(loaderData.messages ?? []);
  const [executionContext, setExecutionContext] = useState<SessionExecutionContext>(
    loaderData.executionContext ?? {
      executionProjectId: APP_ROOT_EXECUTION_PROJECT_ID,
      contextProjectIds: [],
      updatedAt: null,
    },
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const [isOpeningTerminal, setIsOpeningTerminal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { data: projectRegistryData } = useProjectRegistry();

  const selectedModel = useChatStore((state) => state.selectedModel);
  const selectedAgent = useChatStore((state) => state.selectedAgent);
  const sessionStates = useChatStore((state) => state.sessionStates);
  const setServerSessionState = useChatStore((state) => state.setServerSessionState);

  const isSessionRunning = sessionId ? isSessionStatusActive(sessionStates[sessionId]) : false;
  const currentSession = useMemo(
    () => sessions.find((session) => session.id === sessionId) ?? null,
    [sessionId, sessions],
  );
  const managedSession = (currentSession?.managedSession ?? null) as ManagedSessionInfo | null;
  const displayedExecutionContext = currentSession?.executionContext ?? executionContext;
  const currentSessionTitle = useMemo(() => {
    if (!sessionId) {
      return "Session";
    }

    return currentSession?.title || "Untitled";
  }, [currentSession, sessionId]);
  const presentationMessages = useMemo(() => toSessionPresentationMessages(messages), [messages]);
  const registeredProjects = projectRegistryData?.projects ?? [];
  const executionProjectOptions = useMemo(
    () => [
      { value: APP_ROOT_EXECUTION_PROJECT_ID, label: APP_ROOT_EXECUTION_PROJECT_LABEL },
      ...registeredProjects.map((project) => ({ value: project.id, label: project.displayName })),
    ],
    [registeredProjects],
  );
  const executionProjectLabel = useMemo(
    () =>
      executionProjectOptions.find((project) => project.value === displayedExecutionContext.executionProjectId)?.label ??
      displayedExecutionContext.executionProjectId,
    [displayedExecutionContext.executionProjectId, executionProjectOptions],
  );
  const contextProjectLabel = useMemo(() => {
    if (displayedExecutionContext.contextProjectIds.length === 0) {
      return "None";
    }

    return displayedExecutionContext.contextProjectIds
      .map(
        (projectId) =>
          registeredProjects.find((project) => project.id === projectId)?.displayName ?? projectId,
      )
      .join(", ");
  }, [displayedExecutionContext.contextProjectIds, registeredProjects]);
  const contextProjectOptions = useMemo(
    () =>
      registeredProjects
        .filter((project) => project.id !== displayedExecutionContext.executionProjectId)
        .map((project) => ({ value: project.id, label: project.displayName })),
    [displayedExecutionContext.executionProjectId, registeredProjects],
  );

  const loadMessages = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/session/${sessionId}`);
      if (!response.ok) {
        throw new Error("Failed to load messages");
      }
      const data = (await response.json()) as { messages: MessageInfo[] };
      setMessages(data.messages ?? []);
      setErrorMessage(null);
    } catch {
      setErrorMessage("OpenCode server not available");
      toast.error("Unable to load messages", {
        description: "OpenCode server not available",
      });
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    setMessages(loaderData.messages ?? []);
  }, [loaderData.messages]);

  useEffect(() => {
    setExecutionContext(
      loaderData.executionContext ?? {
        executionProjectId: APP_ROOT_EXECUTION_PROJECT_ID,
        contextProjectIds: [],
        updatedAt: null,
      },
    );
  }, [loaderData.executionContext]);

  const refreshSessionStatus = useCallback(async () => {
    if (!sessionId) {
      return null;
    }

    try {
      const status = await fetchSessionStatus(sessionId);
      setServerSessionState(sessionId, status ?? "idle");
      return status;
    } catch {
      return null;
    }
  }, [sessionId, setServerSessionState]);

  const liveThread = useSessionLiveThread({
    onSessionIdle: (activeSessionId) => {
      setServerSessionState(activeSessionId, "idle");
      void loadMessages();

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("sessions:refresh"));
      }
    },
    onSessionStatus: (status, activeSessionId) => {
      setServerSessionState(activeSessionId, status);
    },
    onTextPartMatched: ({ messageId, text }) => {
      if (!messageId) {
        return false;
      }

      let matchedExistingMessage = false;
      setMessages((current) =>
        current.map((message) => {
          if (message.info.id !== messageId) {
            return message;
          }

          matchedExistingMessage = true;
          return mergeMessageInfoText(message, text);
        }),
      );

      return matchedExistingMessage;
    },
    sessionId,
  });
  const liveDraft = useMemo(
    () =>
      liveThread.liveDraft && liveThread.liveDraft.parts.length > 0
        ? {
            fallbackSender: null,
            fallbackSenderLabel: managedSession?.ownerLabel ?? "Assistant",
            messageId: liveThread.liveDraft.messageId,
            parts: liveThread.liveDraft.parts,
          }
        : null,
    [liveThread.liveDraft, managedSession?.ownerLabel],
  );
  const streamingText = useMemo(
    () =>
      liveThread.streamingContent
        ? {
            content: liveThread.streamingContent,
            fallbackSender: null,
            fallbackSenderLabel: "Assistant",
          }
        : null,
    [liveThread.streamingContent],
  );
  const renderSnapshot = useSessionChatRenderSnapshot({
    assistantPending: isSessionRunning,
    continuityAssistant: managedSession
      ? {
          sender: null,
          senderLabel: managedSession.ownerLabel,
        }
      : undefined,
    currentStreamingMessageId: liveThread.streamingMessageId,
    liveDraft,
    messages: presentationMessages,
    onStreamingMessageCommitted: liveThread.clearStreaming,
    streamingText,
  });
  const inspectability = useConversationUnitInspectability(
    renderSnapshot.inspectabilityBoundaries,
  );

  useEffect(() => {
    void refreshSessionStatus();
  }, [refreshSessionStatus]);

  useEffect(() => {
    if (liveThread.isLiveUnavailable) {
      void refreshSessionStatus();
    }
  }, [liveThread.isLiveUnavailable, refreshSessionStatus]);

  useEffect(() => {
    if (!liveThread.isLiveUnavailable || !sessionId || !isSessionRunning) {
      return;
    }

    let cancelled = false;

    const pollAuthoritativeSession = async () => {
      const status = await refreshSessionStatus();
      if (cancelled) {
        return;
      }

      await loadMessages();
      if (cancelled) {
        return;
      }

      if (status && !isSessionStatusActive(status) && typeof window !== "undefined") {
        window.dispatchEvent(new Event("sessions:refresh"));
      }
    };

    void pollAuthoritativeSession();
    const intervalId = window.setInterval(() => {
      void pollAuthoritativeSession();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    isSessionRunning,
    liveThread.isLiveUnavailable,
    loadMessages,
    refreshSessionStatus,
    sessionId,
  ]);

  const handleSend = useCallback(
    async (
      parts: Array<
        { type: "text"; text: string } | { type: "file"; path: string; content?: string }
      >,
      options?: { agent?: string | null }
    ) => {
      if (!sessionId || isLoading) return;
      setIsLoading(true);
      try {
        const payloadParts = parts.map((part) => {
          if (part.type === "text") {
            return { type: "text", text: part.text };
          }
          return { type: "file", path: part.path, content: part.content };
        });
        const response = await fetch(`/api/session/${sessionId}/prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parts: payloadParts,
            model: selectedModel ?? undefined,
            agent: options?.agent ?? selectedAgent ?? undefined,
            missionId: managedSession?.missionId,
          }),
        });
        if (!response.ok) {
          throw new Error("Failed to send message");
        }
        liveThread.clearStreaming();
        await refreshSessionStatus();
        await loadMessages();
      } catch {
        toast.error("Unable to send message", {
          description: "OpenCode server not available",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [
      isLoading,
      liveThread,
      loadMessages,
      managedSession,
      refreshSessionStatus,
      selectedAgent,
      selectedModel,
      sessionId,
    ]
  );

  const handleAbort = useCallback(async () => {
    if (!sessionId || isAborting) return;

    setIsAborting(true);
    try {
      const response = await fetch(`/api/session/${sessionId}/abort`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${response.status}`);
      }

      liveThread.clearStreaming();
      await refreshSessionStatus();
      await loadMessages();

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("sessions:refresh"));
      }
    } catch (error) {
      toast.error("Unable to stop session", {
        description: error instanceof Error ? error.message : "Abort request failed",
      });
    } finally {
      setIsAborting(false);
    }
  }, [
    isAborting,
    liveThread,
    loadMessages,
    refreshSessionStatus,
    sessionId,
  ]);

  const handleOpenTerminal = useCallback(async () => {
    if (!sessionId || isOpeningTerminal) {
      return;
    }

    setIsOpeningTerminal(true);
    try {
      const response = await fetch(`/api/session/${sessionId}/open-terminal`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${response.status}`);
      }

      toast.success("Opened session terminal", {
        description: `opencode -s ${sessionId}`,
      });
    } catch (error) {
      toast.error("Unable to open session terminal", {
        description: error instanceof Error ? error.message : "Terminal launch failed",
      });
    } finally {
      setIsOpeningTerminal(false);
    }
  }, [isOpeningTerminal, sessionId]);

  const handleToggleContextProjectId = useCallback(
    async (projectId: string) => {
      if (!sessionId) {
        return;
      }

      if (managedSession) {
        return;
      }

      const previousContextProjectIds = executionContext.contextProjectIds;
      const nextContextProjectIds = previousContextProjectIds.includes(projectId)
        ? previousContextProjectIds.filter((entry) => entry !== projectId)
        : [...previousContextProjectIds, projectId];

      setExecutionContext((current) => ({
        ...current,
        contextProjectIds: nextContextProjectIds,
      }));

      try {
        const response = await fetch(`/api/session/${sessionId}/context`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            executionProjectId: executionContext.executionProjectId,
            contextProjectIds: nextContextProjectIds,
          }),
        });

        if (!response.ok) {
          const result = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(result?.error ?? `HTTP ${response.status}`);
        }

        const result = (await response.json()) as {
          executionContext?: SessionExecutionContext;
        };
        if (result.executionContext) {
          setExecutionContext(result.executionContext);
        }
      } catch (error) {
        setExecutionContext((current) => ({
          ...current,
          contextProjectIds: previousContextProjectIds,
        }));
        toast.error("Unable to update session context", {
          description: error instanceof Error ? error.message : "Session context update failed",
        });
      }
    },
    [executionContext.contextProjectIds, executionContext.executionProjectId, managedSession, sessionId],
  );

  return (
    <ChatThreadFrame
      autoFollowKey={renderSnapshot.autoFollowKey}
      outerClassName="flex h-full flex-col"
      resetKey={sessionId ?? null}
      scrollSignal={renderSnapshot.scrollSignal}
      header={
        <div className="flex items-start justify-between gap-3 border-border/50 border-b px-5 py-3">
          <div className="min-w-0">
            <h1 className="truncate font-semibold text-sm">{currentSessionTitle}</h1>
            <p className="truncate text-muted-foreground text-xs">{sessionId}</p>
            {managedSession ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-primary">
                  Managed by {managedSession.ownerLabel}
                </span>
                <span>{`Execution: ${executionProjectLabel}`}</span>
                <span>{`Context: ${contextProjectLabel}`}</span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {managedSession ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate(`/noctis-team/mission/${managedSession.missionId}`)}
              >
                Return to Mission
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleOpenTerminal}
              disabled={!sessionId || isOpeningTerminal}
              title="Open session terminal"
            >
              <Terminal className={isOpeningTerminal ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
            </Button>
          </div>
        </div>
      }
      footer={
        <MessageComposer
          sessionId={sessionId ?? undefined}
          executionProjectOptions={executionProjectOptions}
          selectedExecutionProjectId={displayedExecutionContext.executionProjectId}
          executionProjectLocked={true}
          contextProjectOptions={contextProjectOptions}
          selectedContextProjectIds={displayedExecutionContext.contextProjectIds}
          contextProjectsLocked={managedSession !== null}
          contextProjectsStatusLabel={managedSession ? "Managed by mission" : undefined}
          onToggleContextProjectId={handleToggleContextProjectId}
          onSend={handleSend}
          onAbort={handleAbort}
          disabled={isLoading || isAborting}
          isSessionRunning={isSessionRunning}
          isAborting={isAborting}
        />
      }
      contentClassName="mx-auto w-full max-w-3xl space-y-4"
    >
      {() => (
        <>
          {errorMessage ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : (
            <MessageList
              getExpandedDetailEntries={inspectability.getExpandedDetailEntries}
              isConversationUnitExpanded={inspectability.isConversationUnitExpanded}
              onToggleConversationUnit={inspectability.toggleConversationUnit}
              onToggleDetailEntry={inspectability.toggleDetailEntry}
              renderedMessages={renderSnapshot.renderedMessages}
              showPendingIndicator={renderSnapshot.showPendingIndicator}
              streamingMessage={renderSnapshot.streamingMessage}
            />
          )}
        </>
      )}
    </ChatThreadFrame>
  );
};

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  if (!params.id) {
    return {
      executionContext: {
        executionProjectId: APP_ROOT_EXECUTION_PROJECT_ID,
        contextProjectIds: [],
        updatedAt: null,
      },
      messages: [],
    };
  }
  try {
    const url = new URL(request.url);
    const response = await fetch(`${url.origin}/api/session/${params.id}`);
    if (!response.ok) {
      return {
        executionContext: {
          executionProjectId: APP_ROOT_EXECUTION_PROJECT_ID,
          contextProjectIds: [],
          updatedAt: null,
        },
        messages: [],
      };
    }
    const data = (await response.json()) as {
      executionContext?: SessionExecutionContext;
      messages: MessageInfo[];
    };
    return {
      executionContext: data.executionContext ?? {
        executionProjectId: APP_ROOT_EXECUTION_PROJECT_ID,
        contextProjectIds: [],
        updatedAt: null,
      },
      messages: data.messages ?? [],
    };
  } catch {
    return {
      executionContext: {
        executionProjectId: APP_ROOT_EXECUTION_PROJECT_ID,
        contextProjectIds: [],
        updatedAt: null,
      },
      messages: [],
    };
  }
};

export { SessionRoute };
export default SessionRoute;

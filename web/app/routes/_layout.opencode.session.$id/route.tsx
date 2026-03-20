import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useParams } from "react-router";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import MessageComposer from "@/routes/_layout.session.$id/components/message-composer";
import MessageList from "@/routes/_layout.session.$id/components/message-list";
import type { MessageInfo } from "@/routes/_layout.session.$id/types";
import { useChatStore } from "@/stores/chat-store";
import type { OpenCodeOutletContext } from "../_layout.opencode/route";
import type { Route } from "./+types/route";

type EventPayload = {
  type: string;
  properties: {
    sessionID?: string;
    status?: {
      type: "idle" | "busy" | "retry";
      attempt?: number;
      message?: string;
      next?: number;
    };
    part?: {
      type: string;
      text?: string;
      messageID?: string;
      sessionID?: string;
    };
    delta?: string;
    info?: {
      id: string;
      sessionID: string;
    };
  };
};

const OpenCodeSessionRoute = ({ loaderData }: Route.ComponentProps) => {
  const params = useParams();
  const sessionId = params.id;
  const { sessions } = useOutletContext<OpenCodeOutletContext>();
  const [messages, setMessages] = useState<MessageInfo[]>(loaderData.messages ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const selectedModel = useChatStore((state) => state.selectedModel);
  const selectedAgent = useChatStore((state) => state.selectedAgent);
  const sessionStates = useChatStore((state) => state.sessionStates);
  const setSessionState = useChatStore((state) => state.setSessionState);
  const streamingContent = useChatStore((state) => state.streamingContent);
  const streamingMessageId = useChatStore((state) => state.streamingMessageId);
  const appendStreamingContent = useChatStore((state) => state.appendStreamingContent);
  const clearStreamingContent = useChatStore((state) => state.clearStreamingContent);
  const setStreamingMessageId = useChatStore((state) => state.setStreamingMessageId);

  const isSessionRunning = sessionId ? (sessionStates[sessionId] ?? "idle") !== "idle" : false;
  const currentSessionTitle = useMemo(() => {
    if (!sessionId) {
      return "Session";
    }

    return sessions.find((session) => session.id === sessionId)?.title || "Untitled";
  }, [sessionId, sessions]);

  const streamingMessageIdRef = useRef(streamingMessageId);
  useEffect(() => {
    streamingMessageIdRef.current = streamingMessageId;
  }, [streamingMessageId]);

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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingContent.length]);

  useEffect(() => {
    const source = new EventSource("/api/event-stream");
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as { payload?: EventPayload } | EventPayload;
      const actual = ("payload" in payload ? payload.payload : payload) as EventPayload;
      if (!actual?.type) return;

      if (actual.type === "message.part.updated") {
        const part = actual.properties.part;
        if (!part || part.type !== "text") return;
        if (part.sessionID && part.sessionID !== sessionId) return;
        if (part.messageID && part.messageID !== streamingMessageIdRef.current) {
          setStreamingMessageId(part.messageID ?? null);
          clearStreamingContent();
        }
        const delta = actual.properties.delta ?? part.text ?? "";
        if (delta) {
          if (sessionId) {
            setSessionState(sessionId, "busy");
          }
          appendStreamingContent(delta);
        }
      }

      if (actual.type === "session.status") {
        const eventSessionId = actual.properties.sessionID;
        const nextStatus = actual.properties.status?.type;
        if (eventSessionId && nextStatus) {
          setSessionState(eventSessionId, nextStatus);
        }
      }

      if (actual.type === "session.idle") {
        if (sessionId && actual.properties.sessionID === sessionId) {
          setSessionState(sessionId, "idle");
          clearStreamingContent();
          setStreamingMessageId(null);
          loadMessages();
          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("sessions:refresh"));
          }
        }
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => {
      source.close();
    };
  }, [
    appendStreamingContent,
    clearStreamingContent,
    loadMessages,
    sessionId,
    setSessionState,
    setStreamingMessageId,
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
          return {
            type: "file",
            path: part.path,
            content: part.content,
          };
        });
        const response = await fetch(`/api/session/${sessionId}/prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parts: payloadParts,
            model: selectedModel ?? undefined,
            agent: options?.agent ?? selectedAgent ?? undefined,
          }),
        });
        if (!response.ok) {
          throw new Error("Failed to send message");
        }
        setSessionState(sessionId, "busy");
        clearStreamingContent();
        setStreamingMessageId(null);
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
      clearStreamingContent,
      isLoading,
      loadMessages,
      selectedAgent,
      selectedModel,
      sessionId,
      setSessionState,
      setStreamingMessageId,
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

      setSessionState(sessionId, "idle");
      clearStreamingContent();
      setStreamingMessageId(null);
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
    clearStreamingContent,
    isAborting,
    loadMessages,
    sessionId,
    setSessionState,
    setStreamingMessageId,
  ]);

  const displayMessages = useMemo(() => messages, [messages]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-border/50 border-b px-5 py-2.5">
        <h1 className="font-semibold text-sm">{currentSessionTitle}</h1>
        <p className="text-muted-foreground text-xs">{sessionId}</p>
      </div>

      <ScrollArea className="flex-1 px-4 py-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {errorMessage ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : (
            <MessageList messages={displayMessages} streamingContent={streamingContent} />
          )}
          {isSessionRunning && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm border border-border/50 bg-card px-4 py-2.5">
                <div className="flex gap-1.5">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="border-border/50 border-t px-4 py-4">
        <div className="mx-auto max-w-3xl">
          <MessageComposer
            onSend={handleSend}
            onAbort={handleAbort}
            disabled={isLoading || isAborting}
            isSessionRunning={isSessionRunning}
            isAborting={isAborting}
          />
        </div>
      </div>
    </div>
  );
};

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  if (!params.id) {
    return { messages: [] };
  }
  try {
    const url = new URL(request.url);
    const response = await fetch(`${url.origin}/api/session/${params.id}`);
    if (!response.ok) {
      return { messages: [] };
    }
    const data = (await response.json()) as { messages: MessageInfo[] };
    return { messages: data.messages ?? [] };
  } catch {
    return { messages: [] };
  }
};

export default OpenCodeSessionRoute;

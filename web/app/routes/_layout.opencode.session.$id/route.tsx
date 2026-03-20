import { ArrowDown, Terminal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatStore } from "@/stores/chat-store";
import MessageComposer from "./components/message-composer";
import MessageList from "./components/message-list";
import type { MessageInfo } from "./types";
import type { Route } from "./+types/route";
import type { OpenCodeOutletContext } from "../_layout.opencode/route";

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
  };
};

const SessionRoute = ({ loaderData }: Route.ComponentProps) => {
  const params = useParams();
  const sessionId = params.id;
  const { sessions } = useOutletContext<OpenCodeOutletContext>();
  const [messages, setMessages] = useState<MessageInfo[]>(loaderData.messages ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const [isOpeningTerminal, setIsOpeningTerminal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

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

  const syncScrollState = useCallback(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) {
      return;
    }

    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const nearBottom = distanceFromBottom < 72;

    shouldStickToBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = scrollViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    shouldStickToBottomRef.current = true;
    setShowScrollToBottom(false);
    window.setTimeout(() => scrollToBottom("auto"), 0);
  }, [scrollToBottom, sessionId]);

  useEffect(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) {
      return;
    }

    syncScrollState();

    const handleScroll = () => {
      syncScrollState();
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
    };
  }, [syncScrollState]);

  useEffect(() => {
    if (shouldStickToBottomRef.current) {
      scrollToBottom(messages.length > 0 ? "smooth" : "auto");
      return;
    }

    syncScrollState();
  }, [messages.length, scrollToBottom, streamingContent.length, syncScrollState]);

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
          return { type: "file", path: part.path, content: part.content };
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-border/50 border-b px-5 py-3">
        <div className="min-w-0">
          <h1 className="truncate font-semibold text-sm">{currentSessionTitle}</h1>
          <p className="truncate text-muted-foreground text-xs">{sessionId}</p>
        </div>

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

      <div className="relative min-h-0 flex-1">
        <ScrollArea className="h-full px-4 py-4" viewportRef={scrollViewportRef}>
          <div className="mx-auto max-w-3xl space-y-4">
            {errorMessage ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : (
              <MessageList messages={messages} streamingContent={streamingContent} />
            )}

            {isSessionRunning ? (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border border-border/50 bg-card px-4 py-2.5">
                  <div className="flex gap-1.5">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </ScrollArea>

        {showScrollToBottom ? (
          <Button
            className="absolute right-8 bottom-6 h-9 rounded-full border border-white/10 bg-slate-950/90 px-3 text-[11px] text-slate-100 shadow-lg backdrop-blur hover:bg-slate-900"
            onClick={() => scrollToBottom()}
            size="sm"
            type="button"
            variant="outline"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            Latest
          </Button>
        ) : null}
      </div>

      <div className="border-border/50 border-t px-4 py-4">
        <div className="mx-auto max-w-3xl">
          <MessageComposer
            sessionId={sessionId}
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

export default SessionRoute;

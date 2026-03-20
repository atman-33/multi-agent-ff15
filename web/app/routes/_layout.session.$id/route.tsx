import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "./+types/route";
import { useParams } from "react-router";
import { ScrollArea } from "@/components/ui/scroll-area";
import MessageList from "./components/message-list";
import MessageComposer from "./components/message-composer";
import ModelSelector from "./components/model-selector";
import { useChatStore } from "@/stores/chat-store";
import { toast } from "sonner";
import type { MessageInfo } from "./types";

type EventPayload = {
  type: string;
  properties: {
    sessionID?: string;
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

const SessionRoute = ({ loaderData }: Route.ComponentProps) => {
  const params = useParams();
  const sessionId = params.id;
  const [messages, setMessages] = useState<MessageInfo[]>(loaderData.messages ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const selectedModel = useChatStore((state) => state.selectedModel);
  const streamingContent = useChatStore((state) => state.streamingContent);
  const streamingMessageId = useChatStore((state) => state.streamingMessageId);
  const appendStreamingContent = useChatStore((state) => state.appendStreamingContent);
  const clearStreamingContent = useChatStore((state) => state.clearStreamingContent);
  const setStreamingMessageId = useChatStore((state) => state.setStreamingMessageId);

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
  }, [messages, streamingContent]);

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
          appendStreamingContent(delta);
        }
      }

      if (actual.type === "session.idle") {
        if (actual.properties.sessionID === sessionId) {
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
  }, [appendStreamingContent, clearStreamingContent, loadMessages, sessionId, setStreamingMessageId]);

  const handleSend = useCallback(
    async (parts: Array<{ type: "text"; text: string } | { type: "file"; path: string; content?: string }>) => {
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
          body: JSON.stringify({ parts: payloadParts, model: selectedModel ?? undefined }),
        });
        if (!response.ok) {
          throw new Error("Failed to send message");
        }
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
    [clearStreamingContent, isLoading, loadMessages, selectedModel, sessionId, setStreamingMessageId]
  );

  const displayMessages = useMemo(() => messages, [messages]);

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Select a session to start chatting.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-border/50 border-b px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-semibold text-sm">Session</h1>
            <p className="text-muted-foreground text-xs">{sessionId}</p>
          </div>
          <ModelSelector />
        </div>
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
          {isLoading && (
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
          <MessageComposer onSend={handleSend} disabled={isLoading} />
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

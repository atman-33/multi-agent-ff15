import {
  buildRenderedSessionMessages,
  resolveSessionMessageDisplay,
  toSessionPresentationMessages,
  type RenderedSessionMessage,
} from "@/lib/session-message-presentation";
import type { MessageInfo } from "../types";
import MessageBubble from "./message-bubble";

type Props = {
  messages: MessageInfo[];
  streamingContent: string;
  viewportRef: React.RefObject<HTMLDivElement | null>;
};

const MessageList = ({ messages, streamingContent, viewportRef }: Props) => {
  const displayMessages = buildRenderedSessionMessages(toSessionPresentationMessages(messages));
  const streamingMessageDisplay = streamingContent
    ? resolveSessionMessageDisplay({
        rawText: streamingContent,
        fallbackSender: null,
        fallbackSenderLabel: "Assistant",
      })
    : null;
  const streamingMessage: RenderedSessionMessage | null =
    streamingContent && streamingMessageDisplay
      ? {
          id: "streaming-assistant",
          role: "assistant",
          sender: streamingMessageDisplay.resolvedSender,
          senderLabel: streamingMessageDisplay.resolvedSenderLabel,
          kind: "assistant_message",
          content: streamingContent,
          detailContent: streamingContent,
          rawText: streamingContent,
          parts: [{ type: "text", text: streamingContent }],
          timestamp: new Date(),
          source: "session",
          detailRawText: streamingContent,
          messageDisplay: streamingMessageDisplay,
        }
      : null;

  return (
    <div className="space-y-3">
      {displayMessages.map((message) => (
        <MessageBubble key={message.id} message={message} viewportRef={viewportRef} />
      ))}
      {streamingMessage ? (
        <MessageBubble
          message={streamingMessage}
          showCursor={true}
          viewportRef={viewportRef}
        />
      ) : null}
    </div>
  );
};

export default MessageList;

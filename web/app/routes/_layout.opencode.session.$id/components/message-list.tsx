import MessageBubble from "./message-bubble";
import type { MessageInfo } from "../types";

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  senderLabel: string;
  timestamp: Date;
  parts: MessageInfo["parts"];
  showCursor?: boolean;
};

type Props = {
  messages: MessageInfo[];
  streamingContent: string;
  viewportRef: React.RefObject<HTMLDivElement | null>;
};

function toDisplayMessage(message: MessageInfo): DisplayMessage {
  return {
    id: message.info.id,
    role: message.info.role,
    senderLabel:
      message.info.role === "assistant" ? message.info.agent?.trim() || "Assistant" : "User",
    timestamp: new Date(message.info.time.created),
    parts: message.parts,
  };
}

const MessageList = ({ messages, streamingContent, viewportRef }: Props) => {
  const displayMessages = messages.map(toDisplayMessage);

  return (
    <div className="space-y-3">
      {displayMessages.map((message) => (
        <MessageBubble key={message.id} message={message} viewportRef={viewportRef} />
      ))}
      {streamingContent ? (
        <MessageBubble
          message={{
            id: "streaming-assistant",
            role: "assistant",
            senderLabel: "Assistant",
            timestamp: new Date(),
            parts: [{ type: "text", text: streamingContent }],
            showCursor: true,
          }}
          viewportRef={viewportRef}
        />
      ) : null}
    </div>
  );
};

export default MessageList;

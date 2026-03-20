import MessageBubble from "./message-bubble";
import type { MessageInfo } from "../types";

type Props = {
  messages: MessageInfo[];
  streamingContent: string;
  viewportRef: React.RefObject<HTMLDivElement | null>;
};

const MessageList = ({ messages, streamingContent, viewportRef }: Props) => {
  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <MessageBubble
          key={message.info.id}
          role={message.info.role}
          parts={message.parts}
          viewportRef={viewportRef}
        />
      ))}
      {streamingContent && (
        <MessageBubble
          role="assistant"
          parts={[{ type: "text", text: streamingContent }]}
          viewportRef={viewportRef}
        />
      )}
    </div>
  );
};

export default MessageList;

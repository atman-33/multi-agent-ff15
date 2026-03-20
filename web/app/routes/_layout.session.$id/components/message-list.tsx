import MessageBubble from "./message-bubble";
import type { MessageInfo } from "../types";

type Props = {
  messages: MessageInfo[];
  streamingContent: string;
};

const MessageList = ({ messages, streamingContent }: Props) => {
  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <MessageBubble key={message.info.id} role={message.info.role} parts={message.parts} />
      ))}
      {streamingContent && (
        <MessageBubble
          role="assistant"
          parts={[{ type: "text", text: streamingContent }]}
        />
      )}
    </div>
  );
};

export default MessageList;

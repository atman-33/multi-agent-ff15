import type { RenderedSessionMessage } from "@/lib/session-message-presentation";
import MessageBubble from "./message-bubble";

type Props = {
  renderedMessages: RenderedSessionMessage[];
  streamingMessage: RenderedSessionMessage | null;
  isConversationUnitExpanded: (conversationUnitId: string) => boolean;
  getExpandedDetailEntries: (conversationUnitId: string) => Record<string, true>;
  onToggleConversationUnit: (conversationUnitId: string) => void;
  onToggleDetailEntry: (conversationUnitId: string, detailId: string) => void;
};

const MessageList = ({
  renderedMessages,
  streamingMessage,
  isConversationUnitExpanded,
  getExpandedDetailEntries,
  onToggleConversationUnit,
  onToggleDetailEntry,
}: Props) => {
  return (
    <div className="space-y-3">
      {renderedMessages.map((message) => (
        <MessageBubble
          detailsExpanded={isConversationUnitExpanded(message.conversationUnitId)}
          expandedDetailEntries={getExpandedDetailEntries(message.conversationUnitId)}
          key={message.conversationUnitId}
          message={message}
          onToggleDetail={onToggleDetailEntry}
          onToggleDetails={onToggleConversationUnit}
        />
      ))}
      {streamingMessage ? (
        <MessageBubble
          message={streamingMessage}
          showCursor={true}
        />
      ) : null}
    </div>
  );
};

export default MessageList;

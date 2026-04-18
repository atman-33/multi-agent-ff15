import type { RenderedSessionMessage } from "@/lib/session-message-presentation";
import { SessionMessageBubble } from "./session-message-bubble";

export type SessionMessageListProps = {
  renderedMessages: RenderedSessionMessage[];
  streamingMessage: RenderedSessionMessage | null;
  isConversationUnitExpanded: (conversationUnitId: string) => boolean;
  getExpandedDetailEntries: (conversationUnitId: string) => Record<string, true>;
  onToggleConversationUnit: (conversationUnitId: string) => void;
  onToggleDetailEntry: (conversationUnitId: string, detailId: string) => void;
  renderAvatar?: (message: RenderedSessionMessage) => React.ReactNode;
  renderDetailSheet?: (args: {
    message: RenderedSessionMessage;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => React.ReactNode;
};

export function SessionMessageList({
  renderedMessages,
  streamingMessage,
  isConversationUnitExpanded,
  getExpandedDetailEntries,
  onToggleConversationUnit,
  onToggleDetailEntry,
  renderAvatar,
  renderDetailSheet,
}: SessionMessageListProps) {
  return (
    <div className="space-y-3">
      {renderedMessages.map((message) => (
        <SessionMessageBubble
          detailsExpanded={isConversationUnitExpanded(message.conversationUnitId)}
          expandedDetailEntries={getExpandedDetailEntries(message.conversationUnitId)}
          key={message.conversationUnitId}
          message={message}
          onToggleDetail={onToggleDetailEntry}
          onToggleDetails={onToggleConversationUnit}
          renderAvatar={renderAvatar}
          renderDetailSheet={renderDetailSheet}
        />
      ))}
      {streamingMessage ? (
        <SessionMessageBubble
          message={streamingMessage}
          renderAvatar={renderAvatar}
          renderDetailSheet={renderDetailSheet}
          showCursor={true}
        />
      ) : null}
    </div>
  );
}
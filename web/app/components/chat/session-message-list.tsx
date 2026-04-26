import type { ReactNode } from "react";
import type { RenderedSessionMessage } from "@/lib/session-message-presentation";
import { SessionMessageBubble } from "./session-message-bubble";

export type SessionMessageListProps = {
  renderedMessages: RenderedSessionMessage[];
  streamingMessage: RenderedSessionMessage | null;
  isConversationUnitExpanded: (conversationUnitId: string) => boolean;
  getExpandedDetailEntries: (conversationUnitId: string) => Record<string, true>;
  onToggleConversationUnit: (conversationUnitId: string) => void;
  onToggleDetailEntry: (conversationUnitId: string, detailId: string) => void;
  pendingIndicator?: ReactNode;
  renderAvatar?: (message: RenderedSessionMessage) => React.ReactNode;
  renderDetailSheet?: (args: {
    message: RenderedSessionMessage;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => React.ReactNode;
  showPendingIndicator?: boolean;
};

export function SessionMessageList({
  renderedMessages,
  streamingMessage,
  isConversationUnitExpanded,
  getExpandedDetailEntries,
  onToggleConversationUnit,
  onToggleDetailEntry,
  pendingIndicator,
  renderAvatar,
  renderDetailSheet,
  showPendingIndicator = false,
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
      {showPendingIndicator ? pendingIndicator ?? null : null}
    </div>
  );
}
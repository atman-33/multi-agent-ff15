import { SessionMessageList } from "@/components/chat/session-message-list";
import type { RenderedSessionMessage } from "@/lib/session-message-presentation";
import MessageDetailSheet from "./message-detail-sheet";

type Props = {
  renderedMessages: RenderedSessionMessage[];
  sessionId?: string | null;
  showPendingIndicator?: boolean;
  streamingMessage: RenderedSessionMessage | null;
  isConversationUnitExpanded: (conversationUnitId: string) => boolean;
  getExpandedDetailEntries: (conversationUnitId: string) => Record<string, true>;
  onToggleConversationUnit: (conversationUnitId: string) => void;
  onToggleDetailEntry: (conversationUnitId: string, detailId: string) => void;
};

function PendingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-sm border border-border/50 bg-card px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" />
        </div>
      </div>
    </div>
  );
}

const MessageList = ({
  renderedMessages,
  sessionId = null,
  showPendingIndicator = false,
  streamingMessage,
  isConversationUnitExpanded,
  getExpandedDetailEntries,
  onToggleConversationUnit,
  onToggleDetailEntry,
}: Props) => {
  return (
    <SessionMessageList
      getExpandedDetailEntries={getExpandedDetailEntries}
      isConversationUnitExpanded={isConversationUnitExpanded}
      onToggleConversationUnit={onToggleConversationUnit}
      onToggleDetailEntry={onToggleDetailEntry}
      pendingIndicator={<PendingIndicator />}
      renderDetailSheet={({ message, onOpenChange, open }) =>
        open ? (
          <MessageDetailSheet
            content={message.messageDisplay.displayContent}
            detailState={message.detailState}
            messageDisplay={message.messageDisplay}
            messageIds={message.sourceMessageIds}
            messageRole={message.role}
            onOpenChange={onOpenChange}
            open={open}
            parts={message.parts}
            rawTextContent={message.detailRawText}
            sessionId={sessionId}
            senderLabel={message.senderLabel}
          />
        ) : null
      }
      renderedMessages={renderedMessages}
      showPendingIndicator={showPendingIndicator}
      streamingMessage={streamingMessage}
    />
  );
};

export default MessageList;

import { SessionMessageList } from "@/components/chat/session-message-list";
import type { RenderedSessionMessage } from "@/lib/session-message-presentation";
import MessageDetailSheet from "./message-detail-sheet";

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
    <SessionMessageList
      getExpandedDetailEntries={getExpandedDetailEntries}
      isConversationUnitExpanded={isConversationUnitExpanded}
      onToggleConversationUnit={onToggleConversationUnit}
      onToggleDetailEntry={onToggleDetailEntry}
      renderDetailSheet={({ message, onOpenChange, open }) =>
        open ? (
          <MessageDetailSheet
            content={message.messageDisplay.displayContent}
            messageDisplay={message.messageDisplay}
            messageRole={message.role}
            onOpenChange={onOpenChange}
            open={open}
            parts={message.parts}
            rawTextContent={message.detailRawText}
            senderLabel={message.senderLabel}
          />
        ) : null
      }
      renderedMessages={renderedMessages}
      streamingMessage={streamingMessage}
    />
  );
};

export default MessageList;

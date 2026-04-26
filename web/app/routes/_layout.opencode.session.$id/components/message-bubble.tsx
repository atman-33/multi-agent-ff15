import { memo } from "react";
import { SessionMessageBubble } from "@/components/chat/session-message-bubble";
import type { RenderedSessionMessage } from "@/lib/session-message-presentation";
import MessageDetailSheet from "./message-detail-sheet";

type Props = {
  message: RenderedSessionMessage;
  showCursor?: boolean;
  detailsExpanded?: boolean;
  expandedDetailEntries?: Record<string, true>;
  onToggleDetails?: (conversationUnitId: string) => void;
  onToggleDetail?: (conversationUnitId: string, detailId: string) => void;
};

const MessageBubble = ({
  message,
  showCursor = false,
  detailsExpanded = false,
  expandedDetailEntries = {},
  onToggleDetails = () => undefined,
  onToggleDetail = () => undefined,
}: Props) => {
  return (
    <SessionMessageBubble
      detailsExpanded={detailsExpanded}
      expandedDetailEntries={expandedDetailEntries}
      message={message}
      onToggleDetail={onToggleDetail}
      onToggleDetails={onToggleDetails}
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
      showCursor={showCursor}
    />
  );
};

export default memo(MessageBubble);

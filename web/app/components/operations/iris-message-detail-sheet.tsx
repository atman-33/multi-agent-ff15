import { SessionMessageDetailSheet } from "@/components/chat/session-message-detail-sheet";
import type { RenderedSessionMessage } from "@/lib/session-message-presentation";

type IrisMessageDetailSheetProps = {
  message: RenderedSessionMessage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function IrisMessageDetailSheet({
  message,
  onOpenChange,
  open,
}: IrisMessageDetailSheetProps) {
  return (
    <SessionMessageDetailSheet
      content={message.messageDisplay.displayContent}
      detailState={message.detailState}
      fallbackSender={message.sender}
      fallbackSenderLabel={message.senderLabel}
      messageDisplay={message.messageDisplay}
      messageIds={message.sourceMessageIds}
      onOpenChange={onOpenChange}
      open={open}
      parts={message.parts}
      rawTextContent={message.detailRawText}
    />
  );
}
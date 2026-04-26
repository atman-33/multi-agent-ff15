import { SessionMessageDetailSheet } from "@/components/chat/session-message-detail-sheet";
import type { MessageDetailState } from "@/lib/opencode-session-types";
import type { SessionMessageDisplay } from "@/lib/session-message-presentation";
import type { MessagePart } from "../types";

type Props = {
  content: string;
  detailState?: MessageDetailState;
  messageIds?: string[];
  rawTextContent?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  parts?: MessagePart[];
  messageRole: "user" | "assistant";
  messageDisplay?: SessionMessageDisplay;
  sessionId?: string | null;
  senderLabel: string;
};

const MessageDetailSheet = ({
  content,
  detailState,
  messageIds,
  rawTextContent,
  onOpenChange,
  open,
  parts,
  messageRole,
  messageDisplay,
  sessionId,
  senderLabel,
}: Props) => {
  return (
    <SessionMessageDetailSheet
      content={content}
      detailState={detailState}
      fallbackSender={messageRole === "user" ? "user" : null}
      fallbackSenderLabel={senderLabel}
      messageDisplay={messageDisplay}
      messageIds={messageIds}
      onOpenChange={onOpenChange}
      open={open}
      parts={parts}
      rawTextContent={rawTextContent}
      sessionId={sessionId}
    />
  );
};

export default MessageDetailSheet;

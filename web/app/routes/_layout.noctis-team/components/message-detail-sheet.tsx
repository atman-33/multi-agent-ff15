import { useEffect, useState } from "react";
import { SessionMessageDetailSheet } from "@/components/chat/session-message-detail-sheet";
import { type WorkflowMessagePresentation } from "@/lib/chat-workflow-presentation";
import { type SessionMessageDisplay } from "@/lib/session-message-presentation";
import { getActivityActorLabel } from "@/lib/team-message-format";
import type { ActivityActorId } from "@/lib/types/mission";
import type { MessageDetailState, MessagePart } from "@/lib/opencode-session-types";

type Props = {
  content: string;
  detailState?: MessageDetailState;
  messageIds?: string[];
  rawTextContent?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  parts?: MessagePart[];
  sessionId?: string | null;
  sender: ActivityActorId | null;
  messageDisplay?: SessionMessageDisplay;
  workflowPresentation?: WorkflowMessagePresentation | null;
};

const MessageDetailSheet = ({
  content,
  detailState,
  messageIds,
  rawTextContent,
  onOpenChange,
  open,
  parts,
  sessionId,
  sender,
  messageDisplay,
  workflowPresentation,
}: Props) => {
  const [hasOpened, setHasOpened] = useState(open);

  useEffect(() => {
    if (open) {
      setHasOpened(true);
    }
  }, [open]);

  if (!open && !hasOpened) {
    return null;
  }

  return (
    <SessionMessageDetailSheet
      content={content}
      detailState={detailState}
      fallbackSender={sender}
      fallbackSenderLabel={sender ? getActivityActorLabel(sender) : "Assistant"}
      messageDisplay={messageDisplay}
      messageIds={messageIds}
      onOpenChange={onOpenChange}
      open={open}
      parts={parts}
      rawTextContent={rawTextContent}
      sessionId={sessionId}
      workflowPresentation={workflowPresentation}
    />
  );
};

export default MessageDetailSheet;

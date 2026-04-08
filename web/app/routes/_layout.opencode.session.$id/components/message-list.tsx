import { useEffect, useMemo, useState } from "react";
import {
  buildRenderedSessionMessages,
  resolveSessionMessageDisplay,
  toSessionPresentationMessages,
  type RenderedSessionMessage,
} from "@/lib/session-message-presentation";
import {
  buildMessageInspectabilityBoundary,
  createMessageInspectabilityState,
  getExpandedDetailEntryIds,
  isConversationUnitExpanded,
  reconcileMessageInspectabilityState,
  toggleConversationUnitExpansion,
  toggleDetailEntryExpansion,
} from "@/lib/message-inspectability-state";
import type { MessageInfo } from "../types";
import MessageBubble from "./message-bubble";

type Props = {
  messages: MessageInfo[];
  streamingContent: string;
  viewportRef: React.RefObject<HTMLDivElement | null>;
};

const MessageList = ({ messages, streamingContent, viewportRef }: Props) => {
  const displayMessages = buildRenderedSessionMessages(toSessionPresentationMessages(messages));
  const [inspectabilityState, setInspectabilityState] = useState(
    createMessageInspectabilityState,
  );
  const inspectabilityBoundaries = useMemo(
    () => displayMessages.map((message) => buildMessageInspectabilityBoundary(message)),
    [displayMessages],
  );

  useEffect(() => {
    setInspectabilityState((current) =>
      reconcileMessageInspectabilityState(current, inspectabilityBoundaries),
    );
  }, [inspectabilityBoundaries]);

  const streamingMessageDisplay = streamingContent
    ? resolveSessionMessageDisplay({
        rawText: streamingContent,
        fallbackSender: null,
        fallbackSenderLabel: "Assistant",
      })
    : null;
  const streamingMessage: RenderedSessionMessage | null =
    streamingContent && streamingMessageDisplay
      ? {
          id: "streaming-assistant",
          conversationUnitId: "streaming-assistant",
          role: "assistant",
          sender: streamingMessageDisplay.resolvedSender,
          senderLabel: streamingMessageDisplay.resolvedSenderLabel,
          kind: "assistant_message",
          content: streamingContent,
          detailContent: streamingContent,
          rawText: streamingContent,
          parts: [{ type: "text", text: streamingContent }],
          timestamp: new Date(),
          source: "session",
          sourceMessageIds: ["streaming-assistant"],
          detailRawText: streamingContent,
          messageDisplay: streamingMessageDisplay,
        }
      : null;

  return (
    <div className="space-y-3">
      {displayMessages.map((message) => (
        <MessageBubble
          detailsExpanded={isConversationUnitExpanded(
            inspectabilityState,
            message.conversationUnitId,
          )}
          expandedDetailIds={getExpandedDetailEntryIds(
            inspectabilityState,
            message.conversationUnitId,
          )}
          key={message.conversationUnitId}
          message={message}
          onToggleDetail={(detailId) =>
            setInspectabilityState((current) =>
              toggleDetailEntryExpansion(current, message.conversationUnitId, detailId),
            )
          }
          onToggleDetails={() =>
            setInspectabilityState((current) =>
              toggleConversationUnitExpansion(current, message.conversationUnitId),
            )
          }
          viewportRef={viewportRef}
        />
      ))}
      {streamingMessage ? (
        <MessageBubble
          message={streamingMessage}
          showCursor={true}
          viewportRef={viewportRef}
        />
      ) : null}
    </div>
  );
};

export default MessageList;

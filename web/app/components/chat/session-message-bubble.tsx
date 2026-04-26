import { memo, useMemo } from "react";
import { MessageMarkdown } from "@/components/chat/message-markdown";
import { MessageBubbleBase } from "@/components/chat/message-bubble-base";
import {
  buildIntermediateDetailSummary,
  MessageIntermediateDetails,
  MessageIntermediateDetailsToggle,
} from "@/components/chat/message-intermediate-details";
import { extractReasoning, extractTools } from "@/lib/chat-message-parts";
import type { RenderedSessionMessage } from "@/lib/session-message-presentation";

export type SessionMessageBubbleProps = {
  message: RenderedSessionMessage;
  showCursor?: boolean;
  detailsExpanded?: boolean;
  expandedDetailEntries?: Record<string, true>;
  onToggleDetails?: (conversationUnitId: string) => void;
  onToggleDetail?: (conversationUnitId: string, detailId: string) => void;
  renderAvatar?: (message: RenderedSessionMessage) => React.ReactNode;
  renderDetailSheet?: (args: {
    message: RenderedSessionMessage;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => React.ReactNode;
};

export const SessionMessageBubble = memo(({
  message,
  showCursor = false,
  detailsExpanded = false,
  expandedDetailEntries = {},
  onToggleDetails = () => undefined,
  onToggleDetail = () => undefined,
  renderAvatar,
  renderDetailSheet,
}: SessionMessageBubbleProps) => {
  const messageDisplay = message.messageDisplay;
  const reasoning = useMemo(() => extractReasoning(message.parts), [message.parts]);
  const tools = useMemo(() => extractTools(message.parts), [message.parts]);
  const displayContent = showCursor
    ? `${messageDisplay.displayContent}▌`
    : messageDisplay.displayContent;
  const copyContent = messageDisplay.displayContent.trim() ? messageDisplay.displayContent : "";
  const hasDetails =
    reasoning.trim().length > 0 ||
    tools.length > 0 ||
    Boolean(messageDisplay.reportDetails?.trim()) ||
    messageDisplay.promptContextSections.length > 0;
  const hasVisibleBody = messageDisplay.displayContent.trim().length > 0;
  const detailSummary = useMemo(
    () =>
      buildIntermediateDetailSummary(
        reasoning,
        tools,
        messageDisplay.reportDetails,
        messageDisplay.promptContextSections,
      ),
    [messageDisplay.promptContextSections, messageDisplay.reportDetails, reasoning, tools],
  );
  const adjustmentIndicator =
    !messageDisplay.resolvedSenderIsUser && messageDisplay.selectionAdjustment ? (
      <span className="rounded-full border border-border/40 bg-black/15 px-2 py-0.5 text-[9px] font-medium tracking-normal text-muted-foreground/85">
        Adjusted
      </span>
    ) : null;

  if (
    !messageDisplay.displayContent &&
    !reasoning &&
    tools.length === 0 &&
    !messageDisplay.reportDetails &&
    messageDisplay.promptContextSections.length === 0
  ) {
    return null;
  }

  return (
    <MessageBubbleBase
      align={messageDisplay.resolvedSenderIsUser ? "end" : "start"}
      avatar={renderAvatar?.(message)}
      bubbleClassName={
        messageDisplay.resolvedSenderIsUser
          ? "rounded-br-md border-primary/20 bg-primary/12 text-foreground"
          : "rounded-bl-md border-border/40 bg-white/6 text-foreground"
      }
      body={
        hasVisibleBody ? (
          messageDisplay.resolvedSenderIsUser ? (
            <p className="wrap-anywhere whitespace-pre-wrap text-[13px] leading-6 text-foreground/90">
              {messageDisplay.displayContent}
              {showCursor ? <span className="animate-pulse text-primary">▌</span> : null}
            </p>
          ) : (
            <div className="markdown-body text-[13px] leading-6 [&_li]:leading-6 [&_p]:leading-6 [&_pre]:text-[11px]">
              <MessageMarkdown>{displayContent}</MessageMarkdown>
            </div>
          )
        ) : (
          <div className="rounded-md border border-dashed border-border/40 bg-black/10 px-2.5 py-2 text-[11px] text-muted-foreground/80">
            Intermediate activity only.
          </div>
        )
      }
      copyContent={copyContent}
      details={
        hasDetails ? (
          <MessageIntermediateDetailsToggle
            detailSummary={detailSummary}
            expanded={detailsExpanded}
            onToggle={() => onToggleDetails(message.conversationUnitId)}
          >
            <MessageIntermediateDetails
              expandedDetailEntries={expandedDetailEntries}
              onToggleDetail={(detailId) => onToggleDetail(message.conversationUnitId, detailId)}
              promptContextSections={messageDisplay.promptContextSections}
              promptContextSource={messageDisplay.promptContextSource}
              reasoning={reasoning}
              reportDetails={messageDisplay.reportDetails}
              tools={tools}
            />
          </MessageIntermediateDetailsToggle>
        ) : null
      }
      renderDetailSheet={({ open, onOpenChange }) =>
        renderDetailSheet ? renderDetailSheet({ message, open, onOpenChange }) : null
      }
      senderMetaSupplement={adjustmentIndicator}
      senderLabel={message.senderLabel}
      timestamp={message.timestamp}
    />
  );
});

SessionMessageBubble.displayName = "SessionMessageBubble";
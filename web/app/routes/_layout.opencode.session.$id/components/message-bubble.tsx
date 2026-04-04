import { memo, useMemo, useState } from "react";
import { MessageMarkdown } from "@/components/chat/message-markdown";
import { MessageBubbleBase } from "@/components/chat/message-bubble-base";
import {
  buildIntermediateDetailSummary,
  MessageIntermediateDetails,
  MessageIntermediateDetailsToggle,
} from "@/components/chat/message-intermediate-details";
import { buildMessageMarkdown, extractReasoning, extractTools } from "@/lib/chat-message-parts";
import type { MessagePart } from "../types";
import { resolveSessionMessageDisplay } from "./message-display";
import MessageDetailSheet from "./message-detail-sheet";

type Props = {
  message: {
    id: string;
    role: "user" | "assistant";
    senderLabel: string;
    timestamp: Date;
    parts: MessagePart[];
    showCursor?: boolean;
  };
  viewportRef: React.RefObject<HTMLDivElement | null>;
};

const MessageBubble = ({ message }: Props) => {
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const rawText = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
  const messageDisplay = useMemo(
    () =>
      resolveSessionMessageDisplay({
        rawText,
        fallbackRole: message.role,
        fallbackSenderLabel: message.senderLabel,
      }),
    [message.role, message.senderLabel, rawText],
  );
  const reasoning = useMemo(() => extractReasoning(message.parts), [message.parts]);
  const tools = useMemo(() => extractTools(message.parts), [message.parts]);
  const messageMarkdown = useMemo(
    () => buildMessageMarkdown(messageDisplay.displayContent, reasoning, tools),
    [messageDisplay.displayContent, reasoning, tools]
  );
  const displayContent = message.showCursor
    ? `${messageDisplay.displayContent}▌`
    : messageDisplay.displayContent;
  const copyContent = messageMarkdown.trim() ? messageMarkdown : messageDisplay.displayContent;
  const hasDetails =
    reasoning.trim().length > 0 ||
    tools.length > 0 ||
    Boolean(messageDisplay.reportDetails?.trim()) ||
    messageDisplay.promptContextSections.length > 0;
  const hasVisibleBody = messageDisplay.displayContent.trim().length > 0 || Boolean(message.showCursor);
  const detailSummary = useMemo(
    () =>
      buildIntermediateDetailSummary(
        reasoning,
        tools,
        messageDisplay.reportDetails,
        messageDisplay.promptContextSections,
      ),
    [messageDisplay.promptContextSections, messageDisplay.reportDetails, reasoning, tools]
  );

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
              {message.showCursor ? <span className="animate-pulse text-primary">▌</span> : null}
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
            onToggle={() => setDetailsExpanded((value) => !value)}
          >
            <MessageIntermediateDetails
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
        open ? (
          <MessageDetailSheet
            content={messageDisplay.displayContent}
            messageRole={message.role}
            onOpenChange={onOpenChange}
            open={open}
            parts={message.parts}
            rawTextContent={rawText}
            senderLabel={message.senderLabel}
          />
        ) : null
      }
      senderLabel={messageDisplay.resolvedSenderLabel}
      timestamp={message.timestamp}
    />
  );
};

export default memo(MessageBubble);

import { memo, useMemo, useState } from "react";
import { MessageMarkdown } from "@/components/chat/message-markdown";
import { MessageBubbleBase } from "@/components/chat/message-bubble-base";
import {
  buildIntermediateDetailSummary,
  MessageIntermediateDetails,
  MessageIntermediateDetailsToggle,
} from "@/components/chat/message-intermediate-details";
import { parseInternalContext, removeInternalContext } from "@/lib/chat-internal-context";
import { buildMessageMarkdown, extractReasoning, extractTools } from "@/lib/chat-message-parts";
import type { MessagePart } from "../types";
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
  const isUser = message.role === "user";
  const rawText = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
  const internalContext = useMemo(() => parseInternalContext(rawText), [rawText]);
  const text = useMemo(() => removeInternalContext(rawText), [rawText]);
  const reasoning = useMemo(() => extractReasoning(message.parts), [message.parts]);
  const tools = useMemo(() => extractTools(message.parts), [message.parts]);
  const messageMarkdown = useMemo(
    () => buildMessageMarkdown(text, reasoning, tools),
    [reasoning, text, tools]
  );
  const displayContent = message.showCursor ? `${text}▌` : text;
  const copyContent = messageMarkdown.trim() ? messageMarkdown : text;
  const hasDetails = reasoning.trim().length > 0 || tools.length > 0 || internalContext !== null;
  const hasVisibleBody = text.trim().length > 0 || Boolean(message.showCursor);
  const detailSummary = useMemo(
    () => buildIntermediateDetailSummary(internalContext, reasoning, tools),
    [internalContext, reasoning, tools]
  );

  if (!text && !reasoning && tools.length === 0 && !internalContext) {
    return null;
  }

  return (
    <MessageBubbleBase
      align={isUser ? "end" : "start"}
      bubbleClassName={
        isUser
          ? "rounded-br-md border-primary/20 bg-primary/12 text-foreground"
          : "rounded-bl-md border-border/40 bg-white/6 text-foreground"
      }
      body={
        hasVisibleBody ? (
          isUser ? (
            <p className="wrap-anywhere whitespace-pre-wrap text-[13px] leading-6 text-foreground/90">
              {text}
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
              internalContext={internalContext}
              reasoning={reasoning}
              tools={tools}
            />
          </MessageIntermediateDetailsToggle>
        ) : null
      }
      renderDetailSheet={({ open, onOpenChange }) =>
        open ? (
          <MessageDetailSheet
            content={messageMarkdown}
            onOpenChange={onOpenChange}
            open={open}
            senderLabel={message.senderLabel}
          />
        ) : null
      }
      senderLabel={message.senderLabel}
      timestamp={message.timestamp}
    />
  );
};

export default memo(MessageBubble);

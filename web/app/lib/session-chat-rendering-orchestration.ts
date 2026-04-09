import {
  buildMessageInspectabilityBoundary,
  type MessageInspectabilityBoundary,
} from "@/lib/message-inspectability-state";
import {
  buildRenderedSessionMessages,
  type RenderedSessionMessage,
  resolveSessionMessageDisplay,
  type SessionPresentationMessage,
} from "@/lib/session-message-presentation";

export type SessionChatRefreshKind =
  | "initial"
  | "noop"
  | "tail-append"
  | "streaming-growth"
  | "structural-change";

export type SessionChatScrollSignal = "none" | "tail-append" | "streaming-growth";

export type SessionChatRenderSnapshot = {
  input: {
    messages: SessionPresentationMessage[];
    streamingText: {
      content: string;
      fallbackSender: SessionPresentationMessage["sender"];
      fallbackSenderLabel: string;
    } | null;
  };
  renderedMessages: RenderedSessionMessage[];
  inspectabilityBoundaries: MessageInspectabilityBoundary[];
  refreshKind: SessionChatRefreshKind;
  scrollSignal: SessionChatScrollSignal;
  autoFollowKey: string | null;
  streamingMessage: RenderedSessionMessage | null;
};

function buildStreamingMessage(input: {
  content: string;
  fallbackSender: SessionPresentationMessage["sender"];
  fallbackSenderLabel: string;
} | null): RenderedSessionMessage | null {
  if (!input || !input.content) {
    return null;
  }

  const messageDisplay = resolveSessionMessageDisplay({
    rawText: input.content,
    fallbackSender: input.fallbackSender,
    fallbackSenderLabel: input.fallbackSenderLabel,
  });

  return {
    id: "streaming-assistant",
    conversationUnitId: "streaming-assistant",
    role: "assistant",
    sender: messageDisplay.resolvedSender,
    senderLabel: messageDisplay.resolvedSenderLabel,
    kind: "assistant_message",
    content: input.content,
    detailContent: input.content,
    rawText: input.content,
    parts: [{ type: "text", text: input.content }],
    timestamp: new Date(),
    source: "session",
    sourceMessageIds: ["streaming-assistant"],
    detailRawText: input.content,
    messageDisplay,
  };
}

function hashText(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

function shallowEqualRecord(
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return !left && !right;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}

function arePartsSemanticallyEqual(
  left: RenderedSessionMessage["parts"],
  right: RenderedSessionMessage["parts"],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((part, index) => {
    const other = right[index];
    if (!other) {
      return false;
    }

    return (
      part.type === other.type &&
      part.text === other.text &&
      part.tool === other.tool &&
      part.detailId === other.detailId &&
      part.sourceMessageId === other.sourceMessageId &&
      shallowEqualRecord(part.state?.input, other.state?.input) &&
      part.state?.status === other.state?.status &&
      part.state?.output === other.state?.output &&
      part.state?.error === other.state?.error
    );
  });
}

function arePromptContextSectionsSemanticallyEqual(
  left: RenderedSessionMessage["messageDisplay"]["promptContextSections"],
  right: RenderedSessionMessage["messageDisplay"]["promptContextSections"],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((section, index) => {
    const other = right[index];
    if (!other) {
      return false;
    }

    return (
      section.key === other.key &&
      section.tagName === other.tagName &&
      section.label === other.label &&
      section.content === other.content &&
      section.preview === other.preview &&
      section.source === other.source &&
      section.detailId === other.detailId &&
      section.sourceMessageId === other.sourceMessageId
    );
  });
}

function areRenderedMessagesSemanticallyEqual(
  left: RenderedSessionMessage,
  right: RenderedSessionMessage,
): boolean {
  return (
    left.conversationUnitId === right.conversationUnitId &&
    left.sender === right.sender &&
    left.senderLabel === right.senderLabel &&
    left.intermediateOnly === right.intermediateOnly &&
    left.detailRawText === right.detailRawText &&
    left.messageDisplay.displayContent === right.messageDisplay.displayContent &&
    left.messageDisplay.promptContextSource === right.messageDisplay.promptContextSource &&
    left.messageDisplay.rawWorkflowPrompt === right.messageDisplay.rawWorkflowPrompt &&
    left.messageDisplay.rawPromptPayload === right.messageDisplay.rawPromptPayload &&
    left.messageDisplay.reportDetails === right.messageDisplay.reportDetails &&
    left.messageDisplay.resolvedSender === right.messageDisplay.resolvedSender &&
    left.messageDisplay.resolvedSenderLabel === right.messageDisplay.resolvedSenderLabel &&
    left.messageDisplay.resolvedSenderIsUser === right.messageDisplay.resolvedSenderIsUser &&
    left.sourceMessageIds.length === right.sourceMessageIds.length &&
    left.sourceMessageIds.every((messageId, index) => messageId === right.sourceMessageIds[index]) &&
    arePartsSemanticallyEqual(left.parts, right.parts) &&
    arePromptContextSectionsSemanticallyEqual(
      left.messageDisplay.promptContextSections,
      right.messageDisplay.promptContextSections,
    )
  );
}

function reuseRenderedMessageReferences(
  nextRenderedMessages: RenderedSessionMessage[],
  previousSnapshot?: SessionChatRenderSnapshot | null,
): RenderedSessionMessage[] {
  if (!previousSnapshot) {
    return nextRenderedMessages;
  }

  const previousByConversationUnitId = new Map(
    previousSnapshot.renderedMessages.map((message) => [message.conversationUnitId, message]),
  );

  return nextRenderedMessages.map((message) => {
    const previousMessage = previousByConversationUnitId.get(message.conversationUnitId);
    if (!previousMessage) {
      return message;
    }

    return areRenderedMessagesSemanticallyEqual(previousMessage, message)
      ? previousMessage
      : message;
  });
}

function reuseStreamingMessageReference(
  streamingMessage: RenderedSessionMessage | null,
  previousSnapshot?: SessionChatRenderSnapshot | null,
): RenderedSessionMessage | null {
  if (!streamingMessage) {
    return null;
  }

  if (previousSnapshot?.streamingMessage?.content === streamingMessage.content) {
    return previousSnapshot.streamingMessage;
  }

  return streamingMessage;
}

function classifyRefreshKind(
  previousSnapshot: SessionChatRenderSnapshot | null | undefined,
  renderedMessages: RenderedSessionMessage[],
  streamingMessage: RenderedSessionMessage | null,
): SessionChatRefreshKind {
  if (!previousSnapshot) {
    return "initial";
  }

  const previousMessages = previousSnapshot.renderedMessages;
  const previousStreamingMessage = previousSnapshot.streamingMessage;

  if (
    previousStreamingMessage?.content !== undefined &&
    streamingMessage?.content !== undefined &&
    previousStreamingMessage.content !== streamingMessage.content
  ) {
    return "streaming-growth";
  }

  if (
    previousMessages.length === renderedMessages.length &&
    renderedMessages.every((message, index) => message === previousMessages[index])
  ) {
    return "noop";
  }

  if (
    previousMessages.length < renderedMessages.length &&
    previousMessages.every((message, index) => message === renderedMessages[index])
  ) {
    return "tail-append";
  }

  const previousTail = previousMessages.at(-1) ?? null;
  const nextTail = renderedMessages.at(-1) ?? null;
  if (
    previousTail &&
    nextTail &&
    previousTail.conversationUnitId === nextTail.conversationUnitId &&
    previousTail !== nextTail
  ) {
    return "streaming-growth";
  }

  return "structural-change";
}

function toScrollSignal(refreshKind: SessionChatRefreshKind): SessionChatScrollSignal {
  if (refreshKind === "tail-append") {
    return "tail-append";
  }

  if (refreshKind === "streaming-growth") {
    return "streaming-growth";
  }

  return "none";
}

function buildAutoFollowKey(
  refreshKind: SessionChatRefreshKind,
  renderedMessages: RenderedSessionMessage[],
  streamingMessage: RenderedSessionMessage | null,
): string | null {
  if (refreshKind === "tail-append") {
    const tailMessage = renderedMessages.at(-1);
    if (!tailMessage) {
      return null;
    }

    return `tail:${tailMessage.conversationUnitId}:${tailMessage.sourceMessageIds.join("|")}`;
  }

  if (refreshKind === "streaming-growth") {
    if (streamingMessage) {
      return `stream:${streamingMessage.conversationUnitId}:${hashText(streamingMessage.content)}`;
    }

    const tailMessage = renderedMessages.at(-1);
    if (!tailMessage) {
      return null;
    }

    return `growth:${tailMessage.conversationUnitId}:${hashText(tailMessage.detailRawText)}`;
  }

  return null;
}

export function buildSessionChatRenderSnapshot({
  messages,
  previousSnapshot = null,
  streamingText = null,
}: {
  messages: SessionPresentationMessage[];
  previousSnapshot?: SessionChatRenderSnapshot | null;
  streamingText?: {
    content: string;
    fallbackSender: SessionPresentationMessage["sender"];
    fallbackSenderLabel: string;
  } | null;
}): SessionChatRenderSnapshot {
  const nextRenderedMessages = reuseRenderedMessageReferences(
    buildRenderedSessionMessages(messages),
    previousSnapshot,
  );
  const inspectabilityBoundaries = nextRenderedMessages.map((message) =>
    buildMessageInspectabilityBoundary(message),
  );
  const streamingMessage = reuseStreamingMessageReference(
    buildStreamingMessage(streamingText),
    previousSnapshot,
  );
  const refreshKind = classifyRefreshKind(
    previousSnapshot,
    nextRenderedMessages,
    streamingMessage,
  );

  return {
    input: { messages, streamingText },
    renderedMessages: nextRenderedMessages,
    inspectabilityBoundaries,
    refreshKind,
    scrollSignal: toScrollSignal(refreshKind),
    autoFollowKey: buildAutoFollowKey(refreshKind, nextRenderedMessages, streamingMessage),
    streamingMessage,
  };
}
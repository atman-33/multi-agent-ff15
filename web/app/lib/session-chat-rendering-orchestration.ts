import { buildMessageMarkdown, extractReasoning, extractText, extractTools } from "@/lib/chat-message-parts";
import {
  buildMessageInspectabilityBoundary,
  type MessageInspectabilityBoundary,
} from "@/lib/message-inspectability-state";
import {
  buildRenderedSessionMessages,
  type RenderedSessionMessage,
  resolveSessionMessageDisplay,
  type SessionContinuityAssistant,
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
    assistantPending: boolean;
    continuityAssistant: SessionContinuityAssistant | null;
    currentStreamingMessageId: string | null;
    liveDraft: {
      fallbackSender: SessionPresentationMessage["sender"];
      fallbackSenderLabel: string;
      messageId: string | null;
      parts: RenderedSessionMessage["parts"];
    } | null;
    messages: SessionPresentationMessage[];
    streamingText: {
      content: string;
      fallbackSender: SessionPresentationMessage["sender"];
      fallbackSenderLabel: string;
    } | null;
  };
  confirmedRenderedMessages: RenderedSessionMessage[];
  confirmedInspectabilityBoundaries: MessageInspectabilityBoundary[];
  renderedMessages: RenderedSessionMessage[];
  inspectabilityBoundaries: MessageInspectabilityBoundary[];
  refreshKind: SessionChatRefreshKind;
  scrollSignal: SessionChatScrollSignal;
  autoFollowKey: string | null;
  showPendingIndicator: boolean;
  streamingMessage: RenderedSessionMessage | null;
};

type LiveDraftInput = NonNullable<SessionChatRenderSnapshot["input"]["liveDraft"]>;

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

function buildStreamingMessageFromLiveDraft(
  input: LiveDraftInput | null,
): RenderedSessionMessage | null {
  if (!input || input.parts.length === 0) {
    return null;
  }

  const content = extractText(input.parts);
  const detailContent = buildMessageMarkdown(
    content,
    extractReasoning(input.parts),
    extractTools(input.parts),
  );
  const messageId = input.messageId ?? "streaming-assistant";
  const messageDisplay = resolveSessionMessageDisplay({
    rawText: content,
    fallbackSender: input.fallbackSender,
    fallbackSenderLabel: input.fallbackSenderLabel,
  });

  return {
    id: messageId,
    conversationUnitId: messageId,
    role: "assistant",
    sender: messageDisplay.resolvedSender,
    senderLabel: messageDisplay.resolvedSenderLabel,
    kind: "assistant_message",
    content,
    detailContent,
    rawText: content,
    parts: input.parts,
    timestamp: new Date(),
    source: "session",
    sourceMessageIds: [messageId],
    detailRawText: detailContent,
    messageDisplay,
  };
}

function containsStreamingMessage(
  messages: SessionPresentationMessage[],
  currentStreamingMessageId: string | null,
): boolean {
  if (!currentStreamingMessageId) {
    return false;
  }

  return messages.some((message) => message.id === currentStreamingMessageId);
}

function mergeUniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizeContinuityAssistantLabel(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function areContinuityAssistantsSemanticallyEqual(
  left: SessionContinuityAssistant | null | undefined,
  right: SessionContinuityAssistant | null | undefined,
): boolean {
  return (
    (left?.sender ?? null) === (right?.sender ?? null) &&
    normalizeContinuityAssistantLabel(left?.senderLabel) ===
      normalizeContinuityAssistantLabel(right?.senderLabel)
  );
}

function matchesContinuityAssistantMessage(
  message: Pick<RenderedSessionMessage, "sender" | "senderLabel">,
  continuityAssistant: SessionContinuityAssistant | null,
): boolean {
  if (!continuityAssistant) {
    return false;
  }

  if (continuityAssistant.sender && message.sender === continuityAssistant.sender) {
    return true;
  }

  const assistantLabel = normalizeContinuityAssistantLabel(continuityAssistant.senderLabel);
  return Boolean(assistantLabel && normalizeContinuityAssistantLabel(message.senderLabel) === assistantLabel);
}

function combineDetailText(left: string, right: string): string {
  return mergeUniqueValues([left.trim(), right.trim()]).join("\n\n");
}

function resolveContinuityAssistant(input: {
  continuityAssistant?: SessionContinuityAssistant | null;
  liveDraft?: LiveDraftInput | null;
  streamingText?: {
    content: string;
    fallbackSender: SessionPresentationMessage["sender"];
    fallbackSenderLabel: string;
  } | null;
}): SessionContinuityAssistant | null {
  if (input.continuityAssistant) {
    return input.continuityAssistant;
  }

  if (input.liveDraft) {
    return {
      sender: input.liveDraft.fallbackSender,
      senderLabel: input.liveDraft.fallbackSenderLabel,
    };
  }

  if (input.streamingText) {
    return {
      sender: input.streamingText.fallbackSender,
      senderLabel: input.streamingText.fallbackSenderLabel,
    };
  }

  return null;
}

function foldIntermediateTailIntoStreamingMessage(
  renderedMessages: RenderedSessionMessage[],
  streamingMessage: RenderedSessionMessage | null,
  continuityAssistant: SessionContinuityAssistant | null,
): {
  renderedMessages: RenderedSessionMessage[];
  streamingMessage: RenderedSessionMessage | null;
} {
  const tailMessage = renderedMessages.at(-1);

  if (
    !tailMessage ||
    !streamingMessage ||
    !tailMessage.intermediateOnly ||
    !matchesContinuityAssistantMessage(tailMessage, continuityAssistant) ||
    !matchesContinuityAssistantMessage(streamingMessage, continuityAssistant) ||
    !streamingMessage.messageDisplay.displayContent.trim()
  ) {
    return { renderedMessages, streamingMessage };
  }

  const mergedTailMessage: RenderedSessionMessage = {
    ...tailMessage,
    content: streamingMessage.content,
    detailContent: combineDetailText(
      tailMessage.detailContent ?? "",
      streamingMessage.detailContent ?? "",
    ),
    rawText: streamingMessage.rawText,
    parts: [...tailMessage.parts, ...streamingMessage.parts],
    sourceMessageIds: mergeUniqueValues([
      ...tailMessage.sourceMessageIds,
      ...streamingMessage.sourceMessageIds,
    ]),
    detailRawText: combineDetailText(tailMessage.detailRawText, streamingMessage.detailRawText),
    intermediateOnly: undefined,
    messageDisplay: {
      ...streamingMessage.messageDisplay,
      promptContextSections: tailMessage.messageDisplay.promptContextSections,
      promptContextSource:
        tailMessage.messageDisplay.promptContextSource ??
        streamingMessage.messageDisplay.promptContextSource,
      rawWorkflowPrompt:
        tailMessage.messageDisplay.rawWorkflowPrompt ??
        streamingMessage.messageDisplay.rawWorkflowPrompt,
      rawPromptPayload:
        tailMessage.messageDisplay.rawPromptPayload ??
        streamingMessage.messageDisplay.rawPromptPayload,
      reportDetails:
        tailMessage.messageDisplay.reportDetails ??
        streamingMessage.messageDisplay.reportDetails,
      selectionAdjustment:
        streamingMessage.messageDisplay.selectionAdjustment ??
        tailMessage.messageDisplay.selectionAdjustment,
    },
  };

  return {
    renderedMessages: [...renderedMessages.slice(0, -1), mergedTailMessage],
    streamingMessage: null,
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

  if (
    previousSnapshot?.streamingMessage &&
    areRenderedMessagesSemanticallyEqual(previousSnapshot.streamingMessage, streamingMessage)
  ) {
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

  if (previousStreamingMessage || streamingMessage) {
    if (!previousStreamingMessage || !streamingMessage) {
      return "streaming-growth";
    }

    if (!areRenderedMessagesSemanticallyEqual(previousStreamingMessage, streamingMessage)) {
      return "streaming-growth";
    }
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
      return `stream:${streamingMessage.conversationUnitId}:${hashText(streamingMessage.detailRawText)}`;
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
  assistantPending = false,
  continuityAssistant,
  currentStreamingMessageId = null,
  liveDraft = null,
  messages,
  previousSnapshot = null,
  streamingText = null,
}: {
  assistantPending?: boolean;
  continuityAssistant?: SessionContinuityAssistant | null;
  currentStreamingMessageId?: string | null;
  liveDraft?: LiveDraftInput | null;
  messages: SessionPresentationMessage[];
  previousSnapshot?: SessionChatRenderSnapshot | null;
  streamingText?: {
    content: string;
    fallbackSender: SessionPresentationMessage["sender"];
    fallbackSenderLabel: string;
  } | null;
}): SessionChatRenderSnapshot {
  const effectiveContinuityAssistant = resolveContinuityAssistant({
    continuityAssistant,
    liveDraft,
    streamingText,
  });
  const canReuseConfirmedTranscript =
    previousSnapshot !== null &&
    previousSnapshot.input.messages === messages &&
    areContinuityAssistantsSemanticallyEqual(
      previousSnapshot.input.continuityAssistant,
      effectiveContinuityAssistant,
    );
  const confirmedRenderedMessages = canReuseConfirmedTranscript
    ? previousSnapshot.confirmedRenderedMessages
    : buildRenderedSessionMessages(
        messages,
        effectiveContinuityAssistant
          ? { continuityAssistant: effectiveContinuityAssistant }
          : undefined,
      );
  const confirmedInspectabilityBoundaries = canReuseConfirmedTranscript
    ? previousSnapshot.confirmedInspectabilityBoundaries
    : confirmedRenderedMessages.map((message) =>
        buildMessageInspectabilityBoundary(message),
      );
  const baseStreamingMessage = containsStreamingMessage(messages, currentStreamingMessageId)
    ? null
    : buildStreamingMessageFromLiveDraft(liveDraft) ?? buildStreamingMessage(streamingText);
  const foldedSnapshotState = foldIntermediateTailIntoStreamingMessage(
    confirmedRenderedMessages,
    baseStreamingMessage,
    effectiveContinuityAssistant,
  );
  const nextRenderedMessages =
    foldedSnapshotState.renderedMessages === confirmedRenderedMessages
      ? confirmedRenderedMessages
      : reuseRenderedMessageReferences(
          foldedSnapshotState.renderedMessages,
          previousSnapshot,
        );
  const inspectabilityBoundaries =
    nextRenderedMessages === confirmedRenderedMessages
      ? confirmedInspectabilityBoundaries
      : nextRenderedMessages.map((message) =>
          buildMessageInspectabilityBoundary(message),
        );
  const streamingMessage = reuseStreamingMessageReference(
    foldedSnapshotState.streamingMessage,
    previousSnapshot,
  );
  const refreshKind = classifyRefreshKind(
    previousSnapshot,
    nextRenderedMessages,
    streamingMessage,
  );

  const showPendingIndicator = assistantPending && !streamingMessage;

  return {
    input: {
      assistantPending,
      continuityAssistant: effectiveContinuityAssistant,
      currentStreamingMessageId,
      liveDraft,
      messages,
      streamingText,
    },
    confirmedRenderedMessages,
    confirmedInspectabilityBoundaries,
    renderedMessages: nextRenderedMessages,
    inspectabilityBoundaries,
    refreshKind,
    scrollSignal: toScrollSignal(refreshKind),
    autoFollowKey: buildAutoFollowKey(refreshKind, nextRenderedMessages, streamingMessage),
    showPendingIndicator,
    streamingMessage,
  };
}
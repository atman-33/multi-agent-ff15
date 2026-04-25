import { removeInternalContext } from "@/lib/chat-internal-context";
import { extractReasoning, extractText, extractTools } from "@/lib/chat-message-parts";
import {
  parseInjectedPromptContextSections,
  parseWorkflowMessagePresentation,
  type PromptContextSection,
  type PromptContextSource,
  type WorkflowMessagePresentation,
} from "@/lib/chat-workflow-presentation";
import {
  isSessionSelectionAdjustment,
  type SessionSelectionAdjustment,
} from "@/lib/session-selection-adjustment";
import { getActivityActorLabel, parseRoutedMessageEnvelope } from "@/lib/team-message-format";
import type { ActivityActorId, MissionActivityKind } from "@/lib/types/mission";
import type { MessageInfo, MessagePart } from "@/lib/opencode-session-types";

export type SessionPresentationMessage = {
  id: string;
  role: "user" | "assistant";
  selectionAdjustment?: SessionSelectionAdjustment | null;
  sender: ActivityActorId | null;
  senderLabel: string;
  kind: MissionActivityKind;
  content: string;
  detailContent?: string;
  rawText?: string;
  parts?: MessagePart[];
  timestamp: Date;
  source: "session" | "activity";
};

export type SessionMessageDisplay = {
  displayContent: string;
  promptContextSections: PromptContextSection[];
  promptContextSource: PromptContextSource | null;
  rawWorkflowPrompt: string | null;
  rawPromptPayload?: string | null;
  reportDetails: string | null;
  selectionAdjustment: SessionSelectionAdjustment | null;
  resolvedSender: ActivityActorId | null;
  resolvedSenderIsUser: boolean;
  resolvedSenderLabel: string;
  workflowPresentation: WorkflowMessagePresentation | null;
};

export type RenderedSessionMessage = Omit<SessionPresentationMessage, "parts"> & {
  conversationUnitId: string;
  sourceMessageIds: string[];
  parts: MessagePart[];
  detailRawText: string;
  messageDisplay: SessionMessageDisplay;
  intermediateOnly?: boolean;
};

export type NormalizeSessionMessagesOptions = {
  assistantSender?: ActivityActorId | null;
  assistantSenderLabel?: string;
};

export type SessionContinuityAssistant = {
  sender?: ActivityActorId | null;
  senderLabel?: string | null;
};

type PreparedSessionMessage = {
  message: SessionPresentationMessage;
  parts: MessagePart[];
  rawText: string;
  display: SessionMessageDisplay;
};

const DEFAULT_SESSION_CONTINUITY_ASSISTANT: SessionContinuityAssistant = {
  sender: "noctis",
  senderLabel: getActivityActorLabel("noctis"),
};

function normalizeActivityActorId(value: string | null | undefined): ActivityActorId | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (
    normalized === "user" ||
    normalized === "noctis" ||
    normalized === "lunafreya" ||
    normalized === "ignis" ||
    normalized === "gladiolus" ||
    normalized === "prompto" ||
    normalized === "iris" ||
    normalized === "system"
  ) {
    return normalized;
  }

  if (normalized === "gladio") {
    return "gladiolus";
  }

  return null;
}

function extractLooseText(parts: MessagePart[]): string {
  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function resolveAssistantErrorText(error: MessageInfo["info"]["error"] | undefined): string {
  if (!error) {
    return "";
  }

  const message = typeof error.message === "string" ? error.message.trim() : "";

  if (error.name === "MessageAbortedError") {
    return message ? `Response interrupted: ${message}` : "Response interrupted.";
  }

  if (message) {
    return `Assistant error: ${message}`;
  }

  return error.name ? `Assistant error: ${error.name}` : "";
}

function getMessageParts(message: SessionPresentationMessage): MessagePart[] {
  if (message.parts && message.parts.length > 0) {
    return message.parts;
  }

  if (!message.content.trim()) {
    return [];
  }

  return [{ type: "text", text: message.content }];
}

function getMessageRawText(message: SessionPresentationMessage): string {
  if (typeof message.rawText === "string" && message.rawText.trim()) {
    return message.rawText;
  }

  const parts = getMessageParts(message);
  if (parts.length > 0) {
    const extracted = extractText(parts);
    if (extracted) {
      return extracted;
    }
  }

  return message.content;
}

function buildDetailText(messages: SessionPresentationMessage[]): string {
  return messages
    .map((message) => {
      if (typeof message.detailContent === "string" && message.detailContent.trim()) {
        return message.detailContent.trim();
      }

      return getMessageRawText(message).trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

function getIntermediatePreview(parts: MessagePart[]): string | null {
  const reasoning = extractReasoning(parts)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (reasoning.length > 0) {
    return reasoning.slice(0, 2).join("\n");
  }

  const tools = extractTools(parts);
  if (tools.length > 0) {
    return `Tool activity: ${tools.length} ${tools.length === 1 ? "event" : "events"}.`;
  }

  return null;
}

function combineTextSections(values: Array<string | null | undefined>): string | null {
  const combined = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join("\n\n");

  return combined || null;
}

function combinePromptContextSource(
  displays: Array<Pick<SessionMessageDisplay, "promptContextSource">>,
): PromptContextSource | null {
  if (displays.some((display) => display.promptContextSource === "workflow")) {
    return "workflow";
  }

  if (displays.some((display) => display.promptContextSource === "injected")) {
    return "injected";
  }

  return null;
}

function resolveRawPromptPayload(rawText: string, displayContent: string): string | null {
  const normalizedRawText = rawText.trim();
  if (!normalizedRawText) {
    return null;
  }

  return normalizedRawText === displayContent.trim() ? null : normalizedRawText;
}

function buildToolDetailId(messageId: string, toolIndex: number): string {
  return `tool:${messageId}:${toolIndex}`;
}

function buildPromptContextDetailId(messageId: string, sectionKey: string): string {
  return `prompt:${messageId}:${sectionKey}`;
}

function attachToolDetailIds(messageId: string, parts: MessagePart[]): MessagePart[] {
  let toolIndex = 0;

  return parts.map((part) => {
    if (part.type !== "tool") {
      return part;
    }

    const nextPart = {
      ...part,
      detailId: part.detailId ?? buildToolDetailId(messageId, toolIndex),
      sourceMessageId: part.sourceMessageId ?? messageId,
    };

    toolIndex += 1;
    return nextPart;
  });
}

function attachPromptContextDetailIds(
  messageId: string,
  sections: PromptContextSection[],
): PromptContextSection[] {
  return sections.map((section) => ({
    ...section,
    detailId: section.detailId ?? buildPromptContextDetailId(messageId, section.key),
    sourceMessageId: section.sourceMessageId ?? messageId,
  }));
}

function buildCombinedMessageDisplay(
  primary: SessionMessageDisplay,
  groupedMessages: PreparedSessionMessage[],
): SessionMessageDisplay {
  return {
    ...primary,
    promptContextSections: groupedMessages.flatMap((entry) => entry.display.promptContextSections),
    promptContextSource: combinePromptContextSource(
      groupedMessages.map((entry) => entry.display),
    ),
    rawWorkflowPrompt: combineTextSections(
      groupedMessages.map((entry) => entry.display.rawWorkflowPrompt),
    ),
    rawPromptPayload: combineTextSections(
      groupedMessages.map((entry) => entry.display.rawPromptPayload),
    ),
    reportDetails: combineTextSections(
      groupedMessages.map((entry) => entry.display.reportDetails),
    ),
  };
}

function prepareSessionMessage(message: SessionPresentationMessage): PreparedSessionMessage {
  const parts = attachToolDetailIds(message.id, getMessageParts(message));
  const rawText = getMessageRawText(message);
  const display = resolveSessionMessageDisplay({
    rawText,
    fallbackSender: message.sender,
    fallbackSenderLabel: message.senderLabel,
    selectionAdjustment: message.selectionAdjustment,
  });

  return {
    message,
    parts,
    rawText,
    display: {
      ...display,
      promptContextSections: attachPromptContextDetailIds(message.id, display.promptContextSections),
    },
  };
}

function toRenderedSessionMessage(
  prepared: PreparedSessionMessage,
  groupedMessages: PreparedSessionMessage[] = [prepared],
): RenderedSessionMessage {
  const messageDisplay = buildCombinedMessageDisplay(prepared.display, groupedMessages);
  const conversationUnitId = groupedMessages[0]?.message.id ?? prepared.message.id;

  return {
    ...prepared.message,
    id: conversationUnitId,
    conversationUnitId,
    sourceMessageIds: groupedMessages.map((entry) => entry.message.id),
    sender: messageDisplay.resolvedSender,
    senderLabel: messageDisplay.resolvedSenderLabel,
    parts: groupedMessages.flatMap((entry) => entry.parts),
    detailRawText: buildDetailText(groupedMessages.map((entry) => entry.message)),
    messageDisplay,
  };
}

function normalizeContinuityAssistantLabel(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function matchesContinuityAssistant(
  display: SessionMessageDisplay,
  continuityAssistant: SessionContinuityAssistant | null,
): boolean {
  if (!continuityAssistant) {
    return false;
  }

  if (continuityAssistant.sender && display.resolvedSender === continuityAssistant.sender) {
    return true;
  }

  const assistantLabel = normalizeContinuityAssistantLabel(continuityAssistant.senderLabel);
  return Boolean(
    assistantLabel &&
      normalizeContinuityAssistantLabel(display.resolvedSenderLabel) === assistantLabel,
  );
}

function flushPendingIntermediateMessages(
  rendered: RenderedSessionMessage[],
  pendingMessages: PreparedSessionMessage[],
  continuityAssistant: SessionContinuityAssistant | null,
): PreparedSessionMessage[] {
  if (pendingMessages.length === 0) {
    return pendingMessages;
  }

  const parts = pendingMessages.flatMap((entry) => entry.parts);
  const preview = getIntermediatePreview(parts);
  const promptContextSections = pendingMessages.flatMap(
    (entry) => entry.display.promptContextSections,
  );
  const reportDetails = combineTextSections(
    pendingMessages.map((entry) => entry.display.reportDetails),
  );
  const rawWorkflowPrompt = combineTextSections(
    pendingMessages.map((entry) => entry.display.rawWorkflowPrompt),
  );
  const rawPromptPayload = combineTextSections(
    pendingMessages.map((entry) => entry.display.rawPromptPayload),
  );

  if (!preview) {
    return [];
  }

  const timestamp = pendingMessages[pendingMessages.length - 1].message.timestamp;
  const detailRawText = buildDetailText(pendingMessages.map((entry) => entry.message));
  const firstPendingMessage = pendingMessages[0];
  const sender =
    continuityAssistant?.sender ??
    firstPendingMessage?.display.resolvedSender ??
    firstPendingMessage?.message.sender ??
    null;
  const senderLabel =
    continuityAssistant?.senderLabel?.trim() ||
    firstPendingMessage?.display.resolvedSenderLabel ||
    firstPendingMessage?.message.senderLabel ||
    "Assistant";
  const conversationUnitId = firstPendingMessage?.message.id ?? "pending-intermediate";

  rendered.push({
    id: conversationUnitId,
    conversationUnitId,
    sourceMessageIds: pendingMessages.map((entry) => entry.message.id),
    role: "assistant",
    sender,
    senderLabel,
    kind: "assistant_message",
    content: "",
    detailContent: detailRawText,
    rawText: detailRawText,
    parts,
    timestamp,
    source: "session",
    detailRawText,
    intermediateOnly: true,
    messageDisplay: {
      displayContent: preview ?? "",
      promptContextSections,
      promptContextSource: combinePromptContextSource(
        pendingMessages.map((entry) => entry.display),
      ),
      rawWorkflowPrompt,
      rawPromptPayload,
      reportDetails,
      selectionAdjustment: null,
      resolvedSender: sender,
      resolvedSenderIsUser: sender === "user",
      resolvedSenderLabel: senderLabel,
      workflowPresentation: null,
    },
  });

  return [];
}

export function normalizeSessionMessages(
  messages: MessageInfo[],
  options?: NormalizeSessionMessagesOptions,
): SessionPresentationMessage[] {
  return messages.reduce<SessionPresentationMessage[]>((accumulator, message, index) => {
    const messageRecord = message as unknown as Record<string, unknown>;
    const info = (messageRecord.info as Record<string, unknown> | undefined) ?? {};
    const parts = Array.isArray(messageRecord.parts) ? (messageRecord.parts as MessagePart[]) : [];
    const rawRole = info.role === "assistant" ? "assistant" : "user";

    const content = extractText(parts);
    const looseText = extractLooseText(parts);
    const errorText =
      rawRole === "assistant"
        ? resolveAssistantErrorText(info.error as MessageInfo["info"]["error"] | undefined)
        : "";
    const fallbackContent = content || looseText || errorText;

    if (!fallbackContent && (rawRole !== "assistant" || parts.length === 0)) {
      return accumulator;
    }

    const rawId = info.id;
    const id =
      typeof rawId === "string" && rawId.length > 0
        ? rawId
        : `restored-${index}-${Date.now().toString(36)}`;
    const routedMessage =
      rawRole === "assistant" ? null : parseRoutedMessageEnvelope(fallbackContent);
    const defaultAssistantSender = normalizeActivityActorId(
      typeof info.agent === "string" ? info.agent : null,
    );
    const defaultAssistantSenderLabel =
      (typeof info.agent === "string" && info.agent.trim()) || "Assistant";
    const assistantSender = options?.assistantSender ?? defaultAssistantSender;
    const assistantSenderLabel =
      typeof options?.assistantSenderLabel === "string" && options.assistantSenderLabel.trim()
        ? options.assistantSenderLabel
        : defaultAssistantSenderLabel;
    const sender =
      rawRole === "assistant"
        ? assistantSender
        : (routedMessage?.speaker ?? "user");
    const senderLabel =
      rawRole === "assistant"
        ? assistantSenderLabel
        : sender
          ? getActivityActorLabel(sender)
          : "User";
    const displayContent = routedMessage
      ? routedMessage.messageType === "report"
        ? routedMessage.body?.trim() ||
          routedMessage.summary?.trim() ||
          routedMessage.details?.trim() ||
          ""
        : routedMessage.body?.trim() || ""
      : fallbackContent;
    const detailContent = routedMessage
      ? routedMessage.messageType === "report"
        ? [routedMessage.body?.trim(), routedMessage.summary?.trim(), routedMessage.details?.trim()]
            .filter(Boolean)
            .join("\n\n")
        : routedMessage.body?.trim() || fallbackContent
      : fallbackContent;
    const createdAt =
      typeof info.time === "object" &&
      info.time !== null &&
      typeof (info.time as { created?: unknown }).created === "number"
        ? (info.time as { created: number }).created
        : null;
    const selectionAdjustment = isSessionSelectionAdjustment(info.selectionAdjustment)
      ? info.selectionAdjustment
      : null;

    accumulator.push({
      id,
      role: rawRole,
      selectionAdjustment,
      sender,
      senderLabel,
      kind:
        rawRole === "assistant"
          ? "assistant_message"
          : sender === "user"
            ? "user_message"
            : "team_message",
      content: displayContent,
      detailContent,
      rawText: fallbackContent,
      parts,
      timestamp: createdAt ? new Date(createdAt) : new Date(Date.now() + index),
      source: "session",
    });

    return accumulator;
  }, []);
}

export function toSessionPresentationMessages(messages: MessageInfo[]): SessionPresentationMessage[] {
  return normalizeSessionMessages(messages);
}

export function resolveSessionMessageDisplay(input: {
  rawText: string;
  fallbackSender: ActivityActorId | null;
  fallbackSenderLabel: string;
  selectionAdjustment?: SessionSelectionAdjustment | null;
}): SessionMessageDisplay {
  const workflowPresentation = parseWorkflowMessagePresentation(input.rawText);
  const hasStructuredWorkflow = Boolean(workflowPresentation && !workflowPresentation.usedFallback);
  const workflowSender = workflowPresentation?.visibleBodyFrom ?? null;
  const promptContextSections = hasStructuredWorkflow
    ? workflowPresentation?.promptContextSections ?? []
    : parseInjectedPromptContextSections(input.rawText);
  const resolvedSender = workflowSender ?? input.fallbackSender;
  const displayContent = workflowPresentation
    ? workflowPresentation.visibleBody
    : removeInternalContext(input.rawText).trim();

  return {
    displayContent,
    promptContextSections,
    promptContextSource: hasStructuredWorkflow
      ? "workflow"
      : promptContextSections.length > 0
        ? "injected"
        : null,
    rawWorkflowPrompt: hasStructuredWorkflow ? workflowPresentation?.rawPrompt ?? null : null,
    rawPromptPayload: resolveRawPromptPayload(input.rawText, displayContent),
    reportDetails: hasStructuredWorkflow ? workflowPresentation?.reportDetails ?? null : null,
    selectionAdjustment: input.selectionAdjustment ?? null,
    resolvedSender,
    resolvedSenderIsUser: resolvedSender === "user",
    resolvedSenderLabel: workflowSender
      ? getActivityActorLabel(workflowSender)
      : resolvedSender
        ? getActivityActorLabel(resolvedSender)
        : input.fallbackSenderLabel,
    workflowPresentation,
  };
}

export function buildRenderedSessionMessages(
  messages: SessionPresentationMessage[],
  options?: {
    continuityAssistant?: SessionContinuityAssistant | null;
  },
): RenderedSessionMessage[] {
  const continuityAssistant =
    options?.continuityAssistant ?? DEFAULT_SESSION_CONTINUITY_ASSISTANT;
  const rendered: RenderedSessionMessage[] = [];
  let pendingIntermediate: PreparedSessionMessage[] = [];

  messages.forEach((message) => {
    const prepared = prepareSessionMessage(message);
    const canCollapseToIntermediate =
      matchesContinuityAssistant(prepared.display, continuityAssistant) &&
      prepared.message.source === "session";

    if (!prepared.display.displayContent && canCollapseToIntermediate) {
      pendingIntermediate.push(prepared);
      return;
    }

    if (!canCollapseToIntermediate) {
      pendingIntermediate = flushPendingIntermediateMessages(
        rendered,
        pendingIntermediate,
        continuityAssistant,
      );
      rendered.push(toRenderedSessionMessage(prepared));
      return;
    }

    rendered.push(toRenderedSessionMessage(prepared, [...pendingIntermediate, prepared]));
    pendingIntermediate = [];
  });

  flushPendingIntermediateMessages(rendered, pendingIntermediate, continuityAssistant);

  return rendered;
}
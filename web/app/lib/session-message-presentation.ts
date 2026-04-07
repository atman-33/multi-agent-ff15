import { removeInternalContext } from "@/lib/chat-internal-context";
import { extractReasoning, extractText, extractTools } from "@/lib/chat-message-parts";
import {
  parseInjectedPromptContextSections,
  parseWorkflowMessagePresentation,
  type PromptContextSection,
  type PromptContextSource,
  type WorkflowMessagePresentation,
} from "@/lib/chat-workflow-presentation";
import { getActivityActorLabel, parseRoutedMessageEnvelope } from "@/lib/team-message-format";
import type { ActivityActorId, MissionActivityKind } from "@/lib/types/mission";
import type { MessageInfo, MessagePart } from "@/routes/_layout.opencode.session.$id/types";

export type SessionPresentationMessage = {
  id: string;
  role: "user" | "assistant";
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
  resolvedSender: ActivityActorId | null;
  resolvedSenderIsUser: boolean;
  resolvedSenderLabel: string;
  workflowPresentation: WorkflowMessagePresentation | null;
};

export type RenderedSessionMessage = Omit<SessionPresentationMessage, "parts"> & {
  parts: MessagePart[];
  detailRawText: string;
  messageDisplay: SessionMessageDisplay;
  intermediateOnly?: boolean;
};

type PreparedSessionMessage = {
  message: SessionPresentationMessage;
  parts: MessagePart[];
  rawText: string;
  display: SessionMessageDisplay;
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
  const parts = getMessageParts(message);
  const rawText = getMessageRawText(message);

  return {
    message,
    parts,
    rawText,
    display: resolveSessionMessageDisplay({
      rawText,
      fallbackSender: message.sender,
      fallbackSenderLabel: message.senderLabel,
    }),
  };
}

function toRenderedSessionMessage(
  prepared: PreparedSessionMessage,
  groupedMessages: PreparedSessionMessage[] = [prepared],
): RenderedSessionMessage {
  const messageDisplay = buildCombinedMessageDisplay(prepared.display, groupedMessages);

  return {
    ...prepared.message,
    sender: messageDisplay.resolvedSender,
    senderLabel: messageDisplay.resolvedSenderLabel,
    parts: groupedMessages.flatMap((entry) => entry.parts),
    detailRawText: buildDetailText(groupedMessages.map((entry) => entry.message)),
    messageDisplay,
  };
}

function flushPendingNoctisMessages(
  rendered: RenderedSessionMessage[],
  pendingNoctis: PreparedSessionMessage[],
): PreparedSessionMessage[] {
  if (pendingNoctis.length === 0) {
    return pendingNoctis;
  }

  const parts = pendingNoctis.flatMap((entry) => entry.parts);
  const preview = getIntermediatePreview(parts);
  const promptContextSections = pendingNoctis.flatMap(
    (entry) => entry.display.promptContextSections,
  );
  const reportDetails = combineTextSections(
    pendingNoctis.map((entry) => entry.display.reportDetails),
  );
  const rawWorkflowPrompt = combineTextSections(
    pendingNoctis.map((entry) => entry.display.rawWorkflowPrompt),
  );
  const rawPromptPayload = combineTextSections(
    pendingNoctis.map((entry) => entry.display.rawPromptPayload),
  );

  if (!preview && promptContextSections.length === 0 && !reportDetails && !rawPromptPayload) {
    return [];
  }

  const timestamp = pendingNoctis[pendingNoctis.length - 1].message.timestamp;
  const detailRawText = buildDetailText(pendingNoctis.map((entry) => entry.message));

  rendered.push({
    id: pendingNoctis.map((entry) => entry.message.id).join(":"),
    role: "assistant",
    sender: "noctis",
    senderLabel: getActivityActorLabel("noctis"),
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
        pendingNoctis.map((entry) => entry.display),
      ),
      rawWorkflowPrompt,
      rawPromptPayload,
      reportDetails,
      resolvedSender: "noctis",
      resolvedSenderIsUser: false,
      resolvedSenderLabel: getActivityActorLabel("noctis"),
      workflowPresentation: null,
    },
  });

  return [];
}

export function toSessionPresentationMessages(messages: MessageInfo[]): SessionPresentationMessage[] {
  return messages.reduce<SessionPresentationMessage[]>((accumulator, message, index) => {
    const messageRecord = message as unknown as Record<string, unknown>;
    const info = (messageRecord.info as Record<string, unknown> | undefined) ?? {};
    const parts = Array.isArray(messageRecord.parts) ? (messageRecord.parts as MessagePart[]) : [];
    const rawRole = info.role === "assistant" ? "assistant" : "user";

    const content = extractText(parts);
    const looseText = extractLooseText(parts);
    const fallbackContent = content || looseText;

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
    const sender =
      rawRole === "assistant"
        ? normalizeActivityActorId(
            typeof info.agent === "string" ? info.agent : null,
          )
        : (routedMessage?.speaker ?? "user");
    const senderLabel =
      rawRole === "assistant"
        ? (typeof info.agent === "string" && info.agent.trim()) || "Assistant"
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

    accumulator.push({
      id,
      role: rawRole,
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

export function resolveSessionMessageDisplay(input: {
  rawText: string;
  fallbackSender: ActivityActorId | null;
  fallbackSenderLabel: string;
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
): RenderedSessionMessage[] {
  const rendered: RenderedSessionMessage[] = [];
  let pendingNoctis: PreparedSessionMessage[] = [];

  messages.forEach((message) => {
    const prepared = prepareSessionMessage(message);
    const canCollapseToIntermediate =
      prepared.display.resolvedSender === "noctis" && prepared.message.source === "session";

    if (!prepared.display.displayContent && canCollapseToIntermediate) {
      pendingNoctis.push(prepared);
      return;
    }

    if (!canCollapseToIntermediate) {
      pendingNoctis = flushPendingNoctisMessages(rendered, pendingNoctis);
      rendered.push(toRenderedSessionMessage(prepared));
      return;
    }

    rendered.push(toRenderedSessionMessage(prepared, [...pendingNoctis, prepared]));
    pendingNoctis = [];
  });

  flushPendingNoctisMessages(rendered, pendingNoctis);

  return rendered;
}
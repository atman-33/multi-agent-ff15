import { Radio } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { MessageMarkdown } from "@/components/chat/message-markdown";
import { MessageBubbleBase } from "@/components/chat/message-bubble-base";
import {
  buildIntermediateDetailSummary,
  MessageIntermediateDetails,
  MessageIntermediateDetailsToggle,
} from "@/components/chat/message-intermediate-details";
import { PromptComposer } from "@/components/chat/prompt-composer";
import { ChatThreadFrame } from "@/components/chat/thread-frame";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getAgentTheme } from "@/lib/agent-theme";
import {
  parseWorkflowMessagePresentation,
  type WorkflowMessagePresentation,
} from "@/lib/chat-workflow-presentation";
import { getAllowedWorkers, getWorkingPartySummary } from "@/lib/noctis-working-party";
import {
  DEFAULT_AUTONOMOUS_OPERATION_LABEL,
  getOperationDisplayLabel,
  type OperationOption,
} from "@/lib/operation-presentation";
import { INTERNAL_AUTONOMOUS_OPERATION_NAME } from "@/lib/operation-runtime/constants";
import type { PromptPart } from "@/lib/prompt-parts";
import { getActivityActorLabel } from "@/lib/team-message-format";
import type { ActivityActorId, MissionActivityKind, OperationState } from "@/lib/types/mission";
import type { MessagePart } from "@/routes/_layout.opencode.session.$id/types";
import { useChatStore } from "@/stores/chat-store";
import { removeInternalContext } from "./internal-context";
import MessageDetailSheet from "./message-detail-sheet";
import { buildMessageMarkdown, extractReasoning, extractText, extractTools } from "./message-parts";

export interface ChatMessage {
  id: string;
  sender: ActivityActorId;
  actor: ActivityActorId;
  speaker: ActivityActorId;
  kind: MissionActivityKind;
  content: string;
  detailContent?: string;
  rawText?: string;
  parts?: MessagePart[];
  timestamp: Date;
  source: "session" | "activity";
}

interface ChatAreaProps {
  messages: ChatMessage[];
  isResponding: boolean;
  isSessionActive?: boolean;
  isStreaming?: boolean;
  availableOperations: OperationOption[];
  selectedOperation: string | null;
  activeOperationState: OperationState | null;
  isOperationSelectionLocked: boolean;
  onSelectedOperationChange: (operationName: string | null) => void;
  onAbort?: () => void;
  onSend: (parts: PromptPart[]) => undefined | Promise<unknown>;
  showAbortAction?: boolean;
}

interface RenderedChatMessage extends ChatMessage {
  displayContent: string;
  intermediateOnly?: boolean;
  workflowPresentation?: WorkflowMessagePresentation | null;
}

const SENDER_AVATARS: Partial<Record<ActivityActorId, string>> = {
  noctis: "/images/noctis.png",
  ignis: "/images/ignis.png",
  gladiolus: "/images/gladiolus.png",
  prompto: "/images/prompto.png",
};

function getSenderAvatar(sender: ActivityActorId): string | null {
  return SENDER_AVATARS[sender] ?? null;
}

function getAvatarThemeStyle(sender: ActivityActorId): React.CSSProperties | undefined {
  const theme = getAgentTheme(sender);
  if (!theme) {
    return undefined;
  }

  return {
    borderColor: theme.ring,
    background: theme.portraitBg,
    boxShadow: `0 0 14px ${theme.glowSoft}`,
  };
}

function toMessageParts(message: ChatMessage): MessagePart[] {
  if (message.sender !== "noctis") {
    if (!message.content) {
      return [];
    }

    return [{ type: "text", text: message.content } as MessagePart];
  }

  if (message.parts && message.parts.length > 0) {
    return message.parts;
  }

  if (!message.content) {
    return [];
  }

  return [{ type: "text", text: message.content } as MessagePart];
}

function getMessageRawText(message: ChatMessage): string {
  if (typeof message.rawText === "string" && message.rawText.trim()) {
    return message.rawText;
  }

  if (message.sender !== "noctis") {
    return message.content;
  }

  if (message.parts && message.parts.length > 0) {
    const extracted = extractText(message.parts);
    return extracted || message.content;
  }

  return message.content;
}

function getMessageDisplayText(
  message: ChatMessage,
  workflowPresentation?: WorkflowMessagePresentation | null,
): string {
  if (workflowPresentation) {
    return workflowPresentation.visibleBody;
  }

  if (message.sender !== "noctis") {
    return removeInternalContext(message.content).trim();
  }

  return removeInternalContext(getMessageRawText(message)).trim();
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

function pickDetailRawText(message: ChatMessage): string {
  const rawText = typeof message.rawText === "string" ? message.rawText.trim() : "";
  if (rawText) {
    return rawText;
  }

  if (typeof message.detailContent === "string" && message.detailContent.trim()) {
    return message.detailContent;
  }

  return getMessageRawText(message);
}

function buildDetailText(messages: ChatMessage[]): string {
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

function buildRenderedMessages(messages: ChatMessage[]): RenderedChatMessage[] {
  const rendered: RenderedChatMessage[] = [];
  let pendingNoctis: ChatMessage[] = [];

  const flushPendingNoctis = () => {
    if (pendingNoctis.length === 0) {
      return;
    }

    const parts = pendingNoctis.flatMap((message) => toMessageParts(message));
    const preview = getIntermediatePreview(parts);

    if (!preview) {
      pendingNoctis = [];
      return;
    }

    rendered.push({
      id: pendingNoctis.map((message) => message.id).join(":"),
      sender: "noctis",
      actor: "noctis",
      speaker: "noctis",
      kind: "assistant_message",
      content: "",
      detailContent: buildDetailText(pendingNoctis),
      parts: parts.length > 0 ? parts : undefined,
      timestamp: pendingNoctis[pendingNoctis.length - 1].timestamp,
      source: "session",
      displayContent: preview,
      intermediateOnly: true,
      workflowPresentation: null,
    });

    pendingNoctis = [];
  };

  messages.forEach((message) => {
    const isOutgoing = message.sender === "user";
    const canCollapseToIntermediate = message.sender === "noctis" && message.source === "session";
    const workflowPresentation = parseWorkflowMessagePresentation(getMessageRawText(message));

    if (isOutgoing) {
      flushPendingNoctis();
      rendered.push({
        ...message,
        displayContent: getMessageDisplayText(message, workflowPresentation),
        workflowPresentation,
      });
      return;
    }

    const displayContent = getMessageDisplayText(message, workflowPresentation);

    if (!displayContent && canCollapseToIntermediate) {
      pendingNoctis.push(message);
      return;
    }

    const groupedMessages = [...pendingNoctis, message];
    const parts = groupedMessages.flatMap((entry) => toMessageParts(entry));

    rendered.push({
      ...message,
      detailContent: buildDetailText(groupedMessages),
      parts: parts.length > 0 ? parts : undefined,
      displayContent,
      workflowPresentation,
    });

    pendingNoctis = [];
  });

  flushPendingNoctis();

  return rendered;
}

const MessageBubble = memo(
  ({ message, showCursor }: { message: RenderedChatMessage; showCursor: boolean }) => {
    const [detailsExpanded, setDetailsExpanded] = useState(false);
    const isOutgoing = message.sender === "user";
    const isNoctis = message.sender === "noctis";
    const senderLabel = getActivityActorLabel(message.sender);
    const avatarSrc = getSenderAvatar(message.sender);
    const detailRawText = useMemo(() => pickDetailRawText(message), [message]);
    const workflowPresentation = useMemo(
      () => message.workflowPresentation ?? parseWorkflowMessagePresentation(detailRawText),
      [detailRawText, message.workflowPresentation],
    );
    const reportDetails = !workflowPresentation?.usedFallback
      ? workflowPresentation?.reportDetails ?? null
      : null;
    const workflowPromptSections = !workflowPresentation?.usedFallback
      ? workflowPresentation?.workflowPromptSections ?? []
      : [];
    const reasoning = useMemo(() => extractReasoning(message.parts ?? []), [message.parts]);
    const tools = useMemo(() => extractTools(message.parts ?? []), [message.parts]);
    const messageMarkdown = useMemo(
      () => buildMessageMarkdown(message.displayContent, reasoning, tools),
      [message.displayContent, reasoning, tools]
    );
    const copyContent = messageMarkdown.trim()
      ? messageMarkdown
      : message.displayContent.trim()
        ? message.displayContent
        : detailRawText;
    const hasDetails =
      reasoning.trim().length > 0 ||
      tools.length > 0 ||
      Boolean(reportDetails?.trim()) ||
      workflowPromptSections.length > 0;
    const hasVisibleBody = message.displayContent.trim().length > 0 || showCursor;
    const detailSummary = useMemo(
      () =>
        buildIntermediateDetailSummary(
          null,
          reasoning,
          tools,
          reportDetails,
          workflowPromptSections,
        ),
      [reasoning, reportDetails, tools, workflowPromptSections],
    );

    return (
      <MessageBubbleBase
        align={isOutgoing ? "end" : "start"}
        avatar={
          !isOutgoing && avatarSrc ? (
            <img
              alt={senderLabel}
              src={avatarSrc}
              className="h-8 w-8 shrink-0 rounded-full border object-cover ring-1 ring-white/6"
              style={getAvatarThemeStyle(message.sender)}
            />
          ) : undefined
        }
        bubbleClassName={
          isOutgoing
            ? "rounded-br-md border-primary/20 bg-primary/12 text-foreground"
            : isNoctis
              ? "rounded-bl-md border-border/40 bg-white/6 text-foreground"
              : "rounded-bl-md border-amber-300/15 bg-amber-50/8 text-foreground"
        }
        body={
          hasVisibleBody ? (
            !isOutgoing ? (
              <div className="markdown-body text-[13px] leading-6 [&_li]:leading-6 [&_p]:leading-6 [&_pre]:text-[11px]">
                <MessageMarkdown>{`${message.displayContent}${showCursor ? "▌" : ""}`}</MessageMarkdown>
              </div>
            ) : (
              <p className="wrap-anywhere whitespace-pre-wrap text-[13px] leading-6 text-foreground/90">
                {message.displayContent}
                {showCursor ? <span className="animate-pulse text-primary">▌</span> : null}
              </p>
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
                internalContext={null}
                reasoning={reasoning}
                reportDetails={reportDetails}
                tools={tools}
                workflowPromptSections={workflowPromptSections}
              />
            </MessageIntermediateDetailsToggle>
          ) : null
        }
        renderDetailSheet={({ open, onOpenChange }) =>
          open ? (
            <MessageDetailSheet
              content={message.displayContent}
              rawTextContent={detailRawText}
              parts={message.parts}
              onOpenChange={onOpenChange}
              open={open}
              sender={message.sender}
              workflowPresentation={workflowPresentation}
            />
          ) : null
        }
        senderLabel={senderLabel}
        timestamp={message.timestamp}
      />
    );
  }
);

MessageBubble.displayName = "MessageBubble";

export const ChatArea = ({
  messages,
  isSessionActive = false,
  isStreaming = false,
  availableOperations,
  selectedOperation,
  activeOperationState,
  isOperationSelectionLocked,
  onSelectedOperationChange,
  onAbort,
  onSend,
  showAbortAction = false,
}: ChatAreaProps) => {
  const renderedMessages = useMemo(() => buildRenderedMessages(messages), [messages]);
  const workingParty = useChatStore((state) => state.workingParty);
  const composerSummary = useMemo(() => {
    const allowedWorkers = getAllowedWorkers(workingParty);
    return getWorkingPartySummary(allowedWorkers);
  }, [workingParty]);
  const defaultOperation = useMemo(
    () =>
      availableOperations.find((operation) => operation.isDefault) ?? {
        value: INTERNAL_AUTONOMOUS_OPERATION_NAME,
        label: DEFAULT_AUTONOMOUS_OPERATION_LABEL,
        description: "",
        isDefault: true,
      },
    [availableOperations]
  );
  const operationSelectValue =
    selectedOperation ??
    (isOperationSelectionLocked ? undefined : defaultOperation.value);
  const selectedOperationOption = useMemo(() => {
    const activeOperationName = activeOperationState?.operationName ?? operationSelectValue;
    if (!activeOperationName) {
      return null;
    }

    return (
      availableOperations.find((operation) => operation.value === activeOperationName) ?? {
        value: activeOperationName,
        label: getOperationDisplayLabel(activeOperationName),
        description: "",
        isDefault: activeOperationName === INTERNAL_AUTONOMOUS_OPERATION_NAME,
      }
    );
  }, [activeOperationState?.operationName, availableOperations, operationSelectValue]);
  const operationBadgeLabel = selectedOperationOption?.label ?? "Workflow unavailable";
  const operationDescription = selectedOperationOption?.description ?? "";
  const operationPlaceholder = isOperationSelectionLocked
    ? "Workflow unavailable"
    : defaultOperation.label;

  return (
    <ChatThreadFrame
      header={
        <div className="flex shrink-0 items-center justify-between border-border/50 border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center">
              <img
                alt="FF15"
                className="h-6 w-6 object-contain"
                src="/images/sword-32x32.png"
              />
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-[0.15em] text-foreground uppercase">
                Regalia Command Center
              </h1>
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
                Noctis Lucis Caelum - Direct Line
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex max-w-60 items-center rounded-full border border-border/60 bg-background/60 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/85">
              <span className="truncate">Workflow: {operationBadgeLabel}</span>
            </div>

            {isSessionActive ? (
              <div className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1">
                <Radio
                  className="h-3 w-3 text-primary"
                  style={{ animation: "agent-glow 1s ease-in-out infinite" }}
                />
                <span className="animate-pulse font-mono text-[9px] font-semibold uppercase tracking-widest text-primary">
                  Radio Incoming
                </span>
              </div>
            ) : null}
          </div>
        </div>
      }
      footer={
        <PromptComposer
          onSend={onSend}
          onAbort={onAbort}
          showAbortAction={showAbortAction}
          topSlot={
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/65">
                  Mission Workflow
                </p>
                <p className="text-xs text-muted-foreground/75">
                  {isOperationSelectionLocked
                    ? "This mission is already running with its current workflow setting."
                    : `${defaultOperation.label} is selected unless you choose another workflow.`}
                </p>
              </div>

              <div className="w-full sm:max-w-56">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Select
                        disabled={isOperationSelectionLocked}
                        value={operationSelectValue}
                        onValueChange={onSelectedOperationChange}
                      >
                        <SelectTrigger className="h-9 bg-background/70 font-mono text-xs uppercase tracking-[0.14em]">
                          <SelectValue placeholder={operationPlaceholder} />
                        </SelectTrigger>
                        <SelectContent>
                          {availableOperations.map((operation) => (
                            <SelectItem key={operation.value} value={operation.value}>
                              {operation.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TooltipTrigger>
                  {operationDescription ? (
                    <TooltipContent side="top" className="max-w-80 text-xs leading-relaxed">
                      {operationDescription}
                    </TooltipContent>
                  ) : null}
                </Tooltip>
              </div>
            </div>
          }
          footerStart={
            <div className="inline-flex max-w-full items-center rounded-full border border-border/60 bg-background/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
              <span className="truncate">{composerSummary}</span>
            </div>
          }
          placeholder="Send a message to Noctis... Use @ for files/folders and / for commands/skills. Shift+Enter for new line"
          helperText="Enter sends · Shift+Enter adds a new line · @ files · / skills"
        />
      }
      contentClassName="mx-auto w-full min-w-0 max-w-3xl space-y-5 overflow-x-hidden"
    >
      {() => (
        <>
          {renderedMessages.map((message, index) => {
            const isLastNoctis =
              isStreaming && message.sender === "noctis" && index === renderedMessages.length - 1;
            return <MessageBubble key={message.id} message={message} showCursor={isLastNoctis} />;
          })}

          {isSessionActive ? (
            <div className="flex items-end gap-2">
              <img
                alt="Noctis"
                src="/images/noctis.png"
                className="h-8 w-8 shrink-0 rounded-full border object-cover ring-1 ring-white/6"
                style={getAvatarThemeStyle("noctis")}
              />
              <div className="rounded-xl rounded-bl-sm border border-border/50 bg-card px-3 py-2">
                <div className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70"
                      style={{
                        animationDelay: `${i * 0.15}s`,
                        animationDuration: "0.9s",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </ChatThreadFrame>
  );
};

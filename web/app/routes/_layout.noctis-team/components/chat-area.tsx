import { FileText, Info, Radio } from "lucide-react";
import { memo, useMemo } from "react";
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
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConversationUnitInspectability } from "@/hooks/use-conversation-unit-inspectability";
import { useSessionChatRenderSnapshot } from "@/hooks/use-session-chat-render-snapshot";
import { getAgentTheme } from "@/lib/agent-theme";
import { getAllowedWorkers, getWorkingPartySummary } from "@/lib/noctis-working-party";
import {
  DEFAULT_AUTONOMOUS_OPERATION_LABEL,
  getOperationDisplayLabel,
  type OperationOption,
} from "@/lib/operation-presentation";
import { INTERNAL_AUTONOMOUS_OPERATION_NAME } from "@/lib/operation-runtime/constants";
import type { PromptPart } from "@/lib/prompt-parts";
import type {
  RenderedSessionMessage,
  SessionPresentationMessage,
} from "@/lib/session-message-presentation";
import { getActivityActorLabel } from "@/lib/team-message-format";
import type { ActivityActorId, MissionActivityKind, OperationState } from "@/lib/types/mission";
import type { MessagePart } from "@/routes/_layout.opencode.session.$id/types";
import { useChatStore } from "@/stores/chat-store";
import MessageDetailSheet from "./message-detail-sheet";
import { buildMessageMarkdown, extractReasoning, extractTools } from "./message-parts";

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
  showExecutionProjectSelector?: boolean;
  executionProjectOptions?: Array<{
    value: string;
    label: string;
  }>;
  selectedExecutionProjectId?: string | null;
  executionProjectHint?: string | null;
  executionProjectError?: string | null;
  onSelectedExecutionProjectChange?: (projectId: string) => void;
  missionExecutionLabel?: string | null;
  missionActionLabel?: string | null;
  onMissionAction?: () => void;
  availableOperations: OperationOption[];
  selectedOperation: string | null;
  activeOperationState: OperationState | null;
  isOperationSelectionLocked: boolean;
  onSelectedOperationChange: (operationRef: string | null) => void;
  onAbort?: () => void;
  onSend: (parts: PromptPart[]) => undefined | Promise<unknown>;
  showAbortAction?: boolean;
  outputCount?: number;
  onOpenOutputs?: () => void;
}

const SENDER_AVATARS: Partial<Record<ActivityActorId, string>> = {
  noctis: "/images/noctis.png",
  ignis: "/images/ignis.png",
  gladiolus: "/images/gladiolus.png",
  prompto: "/images/prompto.png",
};

function getSenderAvatar(sender: ActivityActorId | null): string | null {
  return sender ? SENDER_AVATARS[sender] ?? null : null;
}

function getAvatarThemeStyle(sender: ActivityActorId | null): React.CSSProperties | undefined {
  if (!sender) {
    return undefined;
  }

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

function toSessionPresentationMessage(message: ChatMessage): SessionPresentationMessage {
  return {
    id: message.id,
    role: message.sender === "user" ? "user" : "assistant",
    sender: message.sender,
    senderLabel: getActivityActorLabel(message.sender),
    kind: message.kind,
    content: message.content,
    detailContent: message.detailContent,
    rawText: message.rawText,
    parts: message.parts,
    timestamp: message.timestamp,
    source: message.source,
  };
}

const MessageBubble = memo(
  ({
    message,
    showCursor,
    detailsExpanded,
    expandedDetailEntries,
    onToggleDetails,
    onToggleDetail,
  }: {
    message: RenderedSessionMessage;
    showCursor: boolean;
    detailsExpanded: boolean;
    expandedDetailEntries: Record<string, true>;
    onToggleDetails: (conversationUnitId: string) => void;
    onToggleDetail: (conversationUnitId: string, detailId: string) => void;
  }) => {
    const messageDisplay = message.messageDisplay;
    const isOutgoing = messageDisplay.resolvedSenderIsUser;
    const isNoctis = message.sender === "noctis";
    const senderLabel = message.senderLabel;
    const avatarSrc = getSenderAvatar(message.sender);
    const reasoning = useMemo(() => extractReasoning(message.parts ?? []), [message.parts]);
    const tools = useMemo(() => extractTools(message.parts ?? []), [message.parts]);
    const messageMarkdown = useMemo(
      () => buildMessageMarkdown(messageDisplay.displayContent, reasoning, tools),
      [messageDisplay.displayContent, reasoning, tools]
    );
    const copyContent = messageMarkdown.trim()
      ? messageMarkdown
      : messageDisplay.displayContent.trim()
        ? messageDisplay.displayContent
        : message.detailRawText;
    const hasDetails =
      reasoning.trim().length > 0 ||
      tools.length > 0 ||
      Boolean(messageDisplay.reportDetails?.trim()) ||
      messageDisplay.promptContextSections.length > 0;
    const hasVisibleBody = messageDisplay.displayContent.trim().length > 0 || showCursor;
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
                <MessageMarkdown>{`${messageDisplay.displayContent}${showCursor ? "▌" : ""}`}</MessageMarkdown>
              </div>
            ) : (
              <p className="wrap-anywhere whitespace-pre-wrap text-[13px] leading-6 text-foreground/90">
                {messageDisplay.displayContent}
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
          open ? (
            <MessageDetailSheet
              content={messageDisplay.displayContent}
              messageDisplay={messageDisplay}
              rawTextContent={message.detailRawText}
              parts={message.parts}
              onOpenChange={onOpenChange}
              open={open}
              sender={message.sender}
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
  showExecutionProjectSelector = false,
  executionProjectOptions = [],
  selectedExecutionProjectId = null,
  executionProjectHint = null,
  executionProjectError = null,
  onSelectedExecutionProjectChange,
  missionExecutionLabel = null,
  missionActionLabel = null,
  onMissionAction,
  availableOperations,
  selectedOperation,
  activeOperationState,
  isOperationSelectionLocked,
  onSelectedOperationChange,
  onAbort,
  onSend,
  showAbortAction = false,
  outputCount = 0,
  onOpenOutputs,
}: ChatAreaProps) => {
  const presentationMessages = useMemo(
    () => messages.map(toSessionPresentationMessage),
    [messages],
  );
  const renderSnapshot = useSessionChatRenderSnapshot({
    messages: presentationMessages,
  });
  const inspectability = useConversationUnitInspectability(
    renderSnapshot.inspectabilityBoundaries,
  );

  const workingParty = useChatStore((state) => state.workingParty);
  const composerSummary = useMemo(() => {
    const allowedWorkers = getAllowedWorkers(workingParty);
    return getWorkingPartySummary(allowedWorkers);
  }, [workingParty]);
  const defaultOperation = useMemo(
    () =>
      availableOperations.find((operation) => operation.isDefault) ?? {
        value: "",
        label: DEFAULT_AUTONOMOUS_OPERATION_LABEL,
        description: "",
        isDefault: true,
        name: INTERNAL_AUTONOMOUS_OPERATION_NAME,
        sourceKind: "builtin" as const,
        sourceLabel: "Builtin",
      },
    [availableOperations]
  );
  const operationSelectValue =
    selectedOperation ??
    (isOperationSelectionLocked ? undefined : defaultOperation.value);
  const selectedOperationOption = useMemo(() => {
    const activeOperationRef = activeOperationState?.operationRef ?? operationSelectValue;
    if (!activeOperationRef) {
      return null;
    }

    return (
      availableOperations.find((operation) => operation.value === activeOperationRef) ?? {
        value: activeOperationRef,
        label: getOperationDisplayLabel(activeOperationState?.operationName ?? activeOperationRef),
        description: "",
        isDefault: (activeOperationState?.operationName ?? "") === INTERNAL_AUTONOMOUS_OPERATION_NAME,
        name: activeOperationState?.operationName ?? activeOperationRef,
        sourceKind: "builtin" as const,
        sourceLabel: "Builtin",
      }
    );
  }, [
    activeOperationState?.operationName,
    activeOperationState?.operationRef,
    availableOperations,
    operationSelectValue,
  ]);
  const operationBadgeLabel = selectedOperationOption?.label ?? "Workflow unavailable";
  const operationDescription = selectedOperationOption?.description ?? "";
  const operationPlaceholder = isOperationSelectionLocked
    ? "Workflow unavailable"
    : defaultOperation.label;
  const startedMissionChipClass =
    "inline-flex max-w-full items-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-3 py-1.5 text-[11px] shadow-sm";
  const workflowSelector = (
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
  );

  return (
    <ChatThreadFrame
      autoFollowKey={renderSnapshot.autoFollowKey}
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
            {onOpenOutputs ? (
              <Button
                className="h-7 gap-1.5 px-2.5 font-mono text-[10px] uppercase tracking-[0.16em]"
                onClick={onOpenOutputs}
                size="sm"
                type="button"
                variant="outline"
              >
                <FileText className="h-3.5 w-3.5" />
                Outputs{outputCount > 0 ? ` (${outputCount})` : ""}
              </Button>
            ) : null}

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
            showExecutionProjectSelector ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/65">
                      Execution Project
                    </p>
                    {executionProjectHint ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            aria-label="Execution project help"
                            className="h-4 w-4 rounded-full border border-border/50 p-0 font-mono text-[10px] text-muted-foreground/80"
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <Info className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-72 text-xs leading-relaxed">
                          {executionProjectHint}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                  <Select
                    value={selectedExecutionProjectId ?? undefined}
                    onValueChange={onSelectedExecutionProjectChange}
                  >
                    <SelectTrigger className="h-9 bg-background/70 font-mono text-xs uppercase tracking-[0.14em]">
                      <SelectValue placeholder="Choose a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {executionProjectOptions.map((project) => (
                        <SelectItem key={project.value} value={project.value}>
                          {project.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {executionProjectError ? (
                    <p className="text-[11px] text-destructive">{executionProjectError}</p>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/65">
                    Workflow
                  </p>
                  {workflowSelector}
                </div>
              </div>
            ) : isOperationSelectionLocked ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {missionExecutionLabel ? (
                    <span className={startedMissionChipClass}>
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary/70">
                        Execution
                      </span>
                      <span className="truncate font-semibold text-foreground">{missionExecutionLabel}</span>
                    </span>
                  ) : null}
                  <span className={startedMissionChipClass}>
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary/70">
                      Workflow
                    </span>
                    <span className="truncate font-semibold text-foreground">{operationBadgeLabel}</span>
                  </span>
                </div>

                {missionActionLabel && onMissionAction ? (
                  <Button
                    className="h-8 px-2.5 font-mono text-[10px] uppercase tracking-[0.16em]"
                    onClick={onMissionAction}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {missionActionLabel}
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/65">
                    Mission Workflow
                  </p>
                  <p className="text-xs text-muted-foreground/75">
                    {`${defaultOperation.label} is selected unless you choose another workflow.`}
                  </p>
                </div>

                <div className="w-full sm:max-w-56">{workflowSelector}</div>
              </div>
            )
          }
          footerStart={
            <div className="inline-flex max-w-full items-center rounded-full border border-border/60 bg-background/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
              <span className="truncate">{composerSummary}</span>
            </div>
          }
          placeholder="Send a message to Noctis"
          helperText="Enter sends · Shift+Enter adds a new line · @ files · / skills"
        />
      }
      contentClassName="mx-auto w-full min-w-0 max-w-3xl space-y-5 overflow-x-hidden"
      scrollSignal={renderSnapshot.scrollSignal}
    >
      {() => (
        <>
          {renderSnapshot.renderedMessages.map((message, index) => {
            const isLastNoctis =
              isStreaming &&
              message.sender === "noctis" &&
              index === renderSnapshot.renderedMessages.length - 1;
            return (
              <MessageBubble
                detailsExpanded={inspectability.isConversationUnitExpanded(
                  message.conversationUnitId,
                )}
                expandedDetailEntries={inspectability.getExpandedDetailEntries(
                  message.conversationUnitId,
                )}
                key={message.conversationUnitId}
                message={message}
                onToggleDetail={inspectability.toggleDetailEntry}
                onToggleDetails={inspectability.toggleConversationUnit}
                showCursor={isLastNoctis}
              />
            );
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

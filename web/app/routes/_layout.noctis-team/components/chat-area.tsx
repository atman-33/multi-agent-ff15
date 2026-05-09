import { Info, SlidersHorizontal, Workflow } from "lucide-react";
import {
  memo,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MessageMarkdown } from "@/components/chat/message-markdown";
import { MessageBubbleBase } from "@/components/chat/message-bubble-base";
import {
  buildIntermediateDetailSummary,
  MessageIntermediateDetails,
  MessageIntermediateDetailsToggle,
} from "@/components/chat/message-intermediate-details";
import { PromptComposer } from "@/components/chat/prompt-composer";
import { ChatThreadFrame } from "@/components/chat/thread-frame";
import { WorkspaceLaunchActions } from "@/components/workspace-launch-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConversationUnitInspectability } from "@/hooks/use-conversation-unit-inspectability";
import type {
  AbortSettlementPhase,
  MissionTranscriptPhase,
  MissionTranscriptRetentionState,
} from "@/hooks/use-agent-session";
import { useSessionChatRenderSnapshot } from "@/hooks/use-session-chat-render-snapshot";
import { getAgentTheme } from "@/lib/agent-theme";
import { calculateConversationWindow } from "@/lib/conversation-window";
import type { SessionChatRenderSnapshot } from "@/lib/session-chat-rendering-orchestration";
import {
  DEFAULT_NEW_MISSION_EXECUTION_TARGET_MODE,
  EXECUTION_MODE_TOGGLE_LABEL,
  EXECUTION_MODE_TOOLTIP_COPY,
} from "@/lib/mission-execution-target-mode";
import type { VSCodePreference } from "@/lib/vscode-preferences";
import { getAllowedWorkers, getWorkingPartySummary } from "@/lib/noctis-working-party";
import {
  DEFAULT_AUTONOMOUS_OPERATION_LABEL,
  getOperationDisplayLabel,
  type OperationOption,
} from "@/lib/operation-presentation";
import type { ChatMessage } from "@/lib/noctis-team-ui-types";
import { INTERNAL_AUTONOMOUS_OPERATION_NAME } from "@/lib/operation-runtime/constants";
import type { PromptPart } from "@/lib/prompt-parts";
import type {
  RenderedSessionMessage,
  SessionPresentationMessage,
} from "@/lib/session-message-presentation";
import type { SessionLiveDraft } from "@/lib/session-stream";
import { getActivityActorLabel } from "@/lib/team-message-format";
import type {
  ActivityActorId,
  MissionExecutionTargetMode,
  MissionWorkflowProgress,
  OperationState,
  OperationStatus,
} from "@/lib/types/mission";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import MessageDetailSheet from "./message-detail-sheet";
import { extractReasoning, extractTools } from "./message-parts";

interface ChatAreaProps {
  sessionId?: string | null;
  composerDraftKey?: string | null;
  messages: ChatMessage[];
  retainedHistory?: MissionTranscriptRetentionState;
  currentStreamingMessageId?: string | null;
  liveDraft?: SessionLiveDraft | null;
  onStreamingMessageCommitted?: (messageId: string) => void;
  streamingContent?: string;
  historyErrorMessage?: string | null;
  historyPhase?: MissionTranscriptPhase;
  abortSettlementPhase?: AbortSettlementPhase;
  isResponding: boolean;
  isLoadingHistory?: boolean;
  isStartingMission?: boolean;
  isSessionActive?: boolean;
  isStreaming?: boolean;
  showExecutionProjectSelector?: boolean;
  executionProjectOptions?: Array<{
    value: string;
    label: string;
  }>;
  selectedExecutionProjectId?: string | null;
  executionProjectLaunchPath?: string | null;
  executionProjectVSCodePreference?: VSCodePreference;
  selectedExecutionTargetMode?: MissionExecutionTargetMode;
  executionProjectHint?: string | null;
  executionProjectError?: string | null;
  onSelectedExecutionProjectChange?: (projectId: string) => void;
  onExecutionProjectVSCodePreferenceChange?: (preference: VSCodePreference) => void;
  onSelectedExecutionTargetModeChange?: (mode: MissionExecutionTargetMode) => void;
  missionExecutionLabel?: string | null;
  contextProjects: Array<{
    id: string;
    label: string;
  }>;
  contextActionLabel?: string | null;
  onContextAction?: () => void;
  missionActionLabel?: string | null;
  onMissionAction?: () => void;
  availableOperations: OperationOption[];
  selectedOperation: string | null;
  activeOperationState: OperationState | null;
  workflowProgress?: MissionWorkflowProgress | null;
  isOperationSelectionLocked: boolean;
  onSelectedOperationChange: (operationRef: string | null) => void;
  onAbort?: () => void;
  onSend: (parts: PromptPart[]) => undefined | Promise<unknown>;
  showAbortAction?: boolean;
  showWorkflowSelector?: boolean;
  headerTitle?: string;
  headerSubtitle?: string;
  primaryAgentId?: ActivityActorId;
  primaryAgentAvatarSrc?: string;
  primaryAgentLabel?: string;
  failedDeliveryNotice?: {
    itemId: string;
    failedAt: string;
    reason: string;
    isResending: boolean;
    onResend: () => void;
  } | null;
  composerStatusLabel?: string | null;
  composerPlaceholder?: string;
  startingMissionDescription?: string;
}

const TRANSCRIPT_WINDOW_THRESHOLD = 40;
const TRANSCRIPT_WINDOW_OVERSCAN = 4;
const TRANSCRIPT_ESTIMATED_ROW_HEIGHT = 148;

const SENDER_AVATARS: Partial<Record<ActivityActorId, string>> = {
  noctis: "/images/noctis.png",
  lunafreya: "/images/lunafreya.png",
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
    detailState: message.detailState,
    rawText: message.rawText,
    parts: message.parts,
    timestamp: message.timestamp,
    source: message.source,
  };
}

function ContextProjectBadges({
  projects,
  tone = "default",
}: {
  projects: Array<{ id: string; label: string }>;
  tone?: "default" | "mission";
}) {
  const badgeClassName =
    tone === "mission"
      ? "border-primary/25 bg-background/15 text-foreground/90"
      : "border-border/60 bg-background/70 text-foreground/85";
  const items =
    projects.length > 0
      ? projects
      : [
          {
            id: "none",
            label: "None",
          },
        ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((project) => (
        <Tooltip key={project.id}>
          <TooltipTrigger asChild>
            <Badge
              className={cn(
                "max-w-48 rounded-full px-2 py-0.5 text-[10px] font-medium shadow-none",
                badgeClassName,
              )}
              variant="outline"
            >
              <span className="truncate">{project.label}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-72 text-xs leading-relaxed">
            {project.label}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function MissionContextActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  const needsAttention = label.toLowerCase().includes("assign");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          className={cn(
            "h-8 w-8 rounded-full p-0",
            needsAttention &&
              "border-amber-500/40 text-amber-200 hover:bg-amber-500/10 hover:text-amber-100",
          )}
          onClick={onClick}
          size="sm"
          type="button"
          variant="outline"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs leading-relaxed">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function getWorkflowProgressStatusLabel(status: OperationStatus): string {
  switch (status) {
    case "waiting_for_report":
      return "Waiting";
    case "complete":
      return "Done";
    case "aborted":
      return "Stopped";
    default:
      return "In Progress";
  }
}

function formatWorkflowProgressUpdatedAt(updatedAt: string): string {
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) {
    return "Unavailable";
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function WorkflowProgressSummary({
  workflowProgress,
}: {
  workflowProgress: MissionWorkflowProgress;
}) {
  const statusLabel = getWorkflowProgressStatusLabel(workflowProgress.status);
  const revisitLabel = workflowProgress.visitCount > 1 ? `Pass ${workflowProgress.visitCount}` : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className="h-9 max-w-full justify-start gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 text-left shadow-sm hover:bg-primary/15"
          type="button"
          variant="outline"
        >
          <Workflow className="h-3.5 w-3.5 shrink-0 text-primary/80" />
          <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary/70">
              Operation
            </span>
            <span className="rounded-full border border-primary/20 bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80">
              {workflowProgress.currentStepIndex}/{workflowProgress.totalSteps}
            </span>
            <span className="rounded-full bg-primary/12 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
              {statusLabel}
            </span>
            <span className="truncate font-semibold text-xs text-foreground">
              {workflowProgress.currentStep}
            </span>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3 border-border/60 bg-background/95 p-3 backdrop-blur">
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
            Operation Progress
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 font-mono text-[10px] text-foreground/85">
              {workflowProgress.currentStepIndex}/{workflowProgress.totalSteps}
            </span>
            <span className="rounded-full bg-primary/12 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
              {statusLabel}
            </span>
            {workflowProgress.isTerminal ? (
              <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
                Terminal
              </span>
            ) : null}
            {revisitLabel ? (
              <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 font-mono text-[10px] text-foreground/80">
                {revisitLabel}
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-2 text-xs leading-relaxed text-foreground/85">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/65">
              Operation
            </p>
            <p className="font-semibold text-sm">{workflowProgress.workflowLabel}</p>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/65">
              Current Step
            </p>
            <p className="font-semibold text-sm">{workflowProgress.currentStep}</p>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/65">
              Updated
            </p>
            <p>{formatWorkflowProgressUpdatedAt(workflowProgress.updatedAt)}</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const MessageBubble = memo(
  ({
    message,
    primaryAgentId,
    sessionId,
    showCursor,
    detailsExpanded,
    expandedDetailEntries,
    onToggleDetails,
    onToggleDetail,
  }: {
    message: RenderedSessionMessage;
    primaryAgentId: ActivityActorId;
    sessionId: string | null;
    showCursor: boolean;
    detailsExpanded: boolean;
    expandedDetailEntries: Record<string, true>;
    onToggleDetails: (conversationUnitId: string) => void;
    onToggleDetail: (conversationUnitId: string, detailId: string) => void;
  }) => {
    const messageDisplay = message.messageDisplay;
    const isOutgoing = messageDisplay.resolvedSenderIsUser;
    const visiblePromptContextSections = isOutgoing ? [] : messageDisplay.promptContextSections;
    const isPrimaryAgent = message.sender === primaryAgentId;
    const senderLabel = message.senderLabel;
    const avatarSrc = getSenderAvatar(message.sender);
    const contentColumnClassName = isOutgoing ? "ml-10" : avatarSrc ? undefined : "ml-10";
    const reasoning = useMemo(() => extractReasoning(message.parts ?? []), [message.parts]);
    const tools = useMemo(() => extractTools(message.parts ?? []), [message.parts]);
    const copyContent = messageDisplay.displayContent.trim() ? messageDisplay.displayContent : "";
    const hasDetails =
      reasoning.trim().length > 0 ||
      tools.length > 0 ||
      Boolean(messageDisplay.reportDetails?.trim()) ||
      visiblePromptContextSections.length > 0;
    const hasVisibleBody = messageDisplay.displayContent.trim().length > 0;
    const detailSummary = useMemo(
      () =>
        buildIntermediateDetailSummary(
          reasoning,
          tools,
          messageDisplay.reportDetails,
          visiblePromptContextSections,
        ),
      [messageDisplay.reportDetails, reasoning, tools, visiblePromptContextSections],
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
        contentColumnClassName={contentColumnClassName}
        contentColumnMaxWidthClassName="max-w-[calc(100%_-_5rem)]"
        bubbleClassName={
          isOutgoing
            ? "rounded-br-md border-primary/20 bg-primary/12 text-foreground"
            : isPrimaryAgent
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
                promptContextSections={visiblePromptContextSections}
                promptContextSource={messageDisplay.promptContextSource}
                reasoning={reasoning}
                reportDetails={messageDisplay.reportDetails}
                tools={tools}
              />
            </MessageIntermediateDetailsToggle>
          ) : null
        }
        renderDetailSheet={({ open, onOpenChange }) =>
          (
            <MessageDetailSheet
              content={messageDisplay.displayContent}
              detailState={message.detailState}
              messageDisplay={messageDisplay}
              messageIds={message.sourceMessageIds}
              rawTextContent={message.detailRawText}
              parts={message.parts}
              onOpenChange={onOpenChange}
              open={open}
              sessionId={sessionId}
              sender={message.sender}
            />
          )
        }
        senderLabel={senderLabel}
        timestamp={message.timestamp}
      />
    );
  }
);

MessageBubble.displayName = "MessageBubble";

function useTranscriptWindow(
  renderedMessages: RenderedSessionMessage[],
  viewportRef: RefObject<HTMLDivElement | null>,
) {
  const measuredHeightsRef = useRef<Record<string, number>>({});
  const rowMeasurementCleanupRef = useRef<Record<string, () => void>>({});
  const [measurementVersion, setMeasurementVersion] = useState(0);
  const [viewportState, setViewportState] = useState({
    clientHeight: 0,
    ready: false,
    scrollTop: 0,
  });

  const syncViewportState = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const nextState = {
      clientHeight: viewport.clientHeight,
      ready: true,
      scrollTop: viewport.scrollTop,
    };

    setViewportState((current) =>
      current.ready === nextState.ready &&
      current.scrollTop === nextState.scrollTop &&
      current.clientHeight === nextState.clientHeight
        ? current
        : nextState,
    );
  }, [viewportRef]);

  useEffect(() => {
    syncViewportState();

    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const handleResize = () => {
      syncViewportState();
    };

    viewport.addEventListener("scroll", syncViewportState, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      viewport.removeEventListener("scroll", syncViewportState);
      window.removeEventListener("resize", handleResize);
    };
  }, [syncViewportState, viewportRef]);

  useEffect(() => {
    return () => {
      for (const cleanup of Object.values(rowMeasurementCleanupRef.current)) {
        cleanup();
      }

      rowMeasurementCleanupRef.current = {};
    };
  }, []);

  const registerMeasuredRow = useCallback((conversationUnitId: string) => {
    return (node: HTMLDivElement | null) => {
      rowMeasurementCleanupRef.current[conversationUnitId]?.();
      delete rowMeasurementCleanupRef.current[conversationUnitId];

      if (!node) {
        return;
      }

      const updateMeasuredHeight = () => {
        const nextHeight = Math.ceil(node.getBoundingClientRect().height);
        if (
          nextHeight <= 0 ||
          measuredHeightsRef.current[conversationUnitId] === nextHeight
        ) {
          return;
        }

        measuredHeightsRef.current = {
          ...measuredHeightsRef.current,
          [conversationUnitId]: nextHeight,
        };
        setMeasurementVersion((current) => current + 1);
      };

      updateMeasuredHeight();

      if (typeof ResizeObserver === "undefined") {
        rowMeasurementCleanupRef.current[conversationUnitId] = () => {};
        return;
      }

      const observer = new ResizeObserver(() => {
        updateMeasuredHeight();
      });
      observer.observe(node);

      rowMeasurementCleanupRef.current[conversationUnitId] = () => {
        observer.disconnect();
      };
    };
  }, []);

  const windowState = useMemo(() => {
    void measurementVersion;

    if (
      renderedMessages.length === 0 ||
      !viewportState.ready ||
      renderedMessages.length <= TRANSCRIPT_WINDOW_THRESHOLD
    ) {
      return {
        bottomSpacerHeight: 0,
        topSpacerHeight: 0,
        visibleMessages: renderedMessages,
      };
    }

    const itemHeights = renderedMessages.map(
      (message) =>
        measuredHeightsRef.current[message.conversationUnitId] ??
        TRANSCRIPT_ESTIMATED_ROW_HEIGHT,
    );
    const windowState = calculateConversationWindow({
      itemHeights,
      overscan: TRANSCRIPT_WINDOW_OVERSCAN,
      scrollTop: viewportState.scrollTop,
      viewportHeight: viewportState.clientHeight,
    });

    return {
      bottomSpacerHeight: windowState.bottomSpacerHeight,
      topSpacerHeight: windowState.topSpacerHeight,
      visibleMessages: renderedMessages.slice(
        windowState.startIndex,
        windowState.endIndex,
      ),
    };
  }, [measurementVersion, renderedMessages, viewportState]);

  return {
    ...windowState,
    registerMeasuredRow,
  };
}

const TranscriptBody = memo(
  ({
    historyEmptyCallout,
    historyErrorCallout,
    historyLoadingCallout,
    historyRetentionCallout,
    getExpandedDetailEntries,
    isConversationUnitExpanded,
    isStreaming,
    onToggleConversationUnit,
    onToggleDetailEntry,
    primaryAgentAvatarSrc,
    primaryAgentId,
    primaryAgentLabel,
    renderSnapshot,
    sessionId,
    viewportRef,
  }: {
    historyEmptyCallout: ReactNode;
    historyErrorCallout: ReactNode;
    historyLoadingCallout: ReactNode;
    historyRetentionCallout: ReactNode;
    getExpandedDetailEntries: (conversationUnitId: string) => Record<string, true>;
    isConversationUnitExpanded: (conversationUnitId: string) => boolean;
    isStreaming: boolean;
    onToggleConversationUnit: (conversationUnitId: string) => void;
    onToggleDetailEntry: (conversationUnitId: string, detailId: string) => void;
    primaryAgentAvatarSrc: string;
    primaryAgentId: ActivityActorId;
    primaryAgentLabel: string;
    renderSnapshot: SessionChatRenderSnapshot;
    sessionId: string | null;
    viewportRef: RefObject<HTMLDivElement | null>;
  }) => {
    const {
      bottomSpacerHeight,
      registerMeasuredRow,
      topSpacerHeight,
      visibleMessages,
    } = useTranscriptWindow(renderSnapshot.renderedMessages, viewportRef);

    return (
      <>
      {historyLoadingCallout}
      {historyErrorCallout}
      {historyEmptyCallout}
      {historyRetentionCallout}

      {topSpacerHeight > 0 ? (
        <div aria-hidden="true" style={{ height: `${topSpacerHeight}px` }} />
      ) : null}

      {visibleMessages.map((message) => (
        <div key={message.conversationUnitId} ref={registerMeasuredRow(message.conversationUnitId)}>
          <MessageBubble
            detailsExpanded={isConversationUnitExpanded(message.conversationUnitId)}
            expandedDetailEntries={getExpandedDetailEntries(message.conversationUnitId)}
            message={message}
            onToggleDetail={onToggleDetailEntry}
            onToggleDetails={onToggleConversationUnit}
            primaryAgentId={primaryAgentId}
            sessionId={sessionId}
            showCursor={false}
          />
        </div>
      ))}

      {bottomSpacerHeight > 0 ? (
        <div aria-hidden="true" style={{ height: `${bottomSpacerHeight}px` }} />
      ) : null}

      {renderSnapshot.streamingMessage ? (
        <MessageBubble
          detailsExpanded={false}
          expandedDetailEntries={{}}
          key={renderSnapshot.streamingMessage.conversationUnitId}
          message={renderSnapshot.streamingMessage}
          onToggleDetail={onToggleDetailEntry}
          onToggleDetails={onToggleConversationUnit}
          primaryAgentId={primaryAgentId}
          sessionId={sessionId}
          showCursor={isStreaming}
        />
      ) : null}

      {renderSnapshot.showPendingIndicator ? (
        <div className="flex items-end gap-2">
          <img
            alt={primaryAgentLabel}
            src={primaryAgentAvatarSrc}
            className="h-8 w-8 shrink-0 rounded-full border object-cover ring-1 ring-white/6"
            style={getAvatarThemeStyle(primaryAgentId)}
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
    );
  },
);

TranscriptBody.displayName = "TranscriptBody";

export const ChatArea = ({
  sessionId = null,
  composerDraftKey = null,
  messages,
  retainedHistory,
  currentStreamingMessageId = null,
  onStreamingMessageCommitted,
  streamingContent = "",
  historyErrorMessage = null,
  historyPhase = "idle",
  isLoadingHistory = false,
  isStartingMission = false,
  abortSettlementPhase = "idle",
  isSessionActive = false,
  isStreaming = false,
  showWorkflowSelector = true,
  showExecutionProjectSelector = false,
  executionProjectOptions = [],
  selectedExecutionProjectId = null,
  executionProjectLaunchPath = null,
  executionProjectVSCodePreference = "auto",
  selectedExecutionTargetMode = DEFAULT_NEW_MISSION_EXECUTION_TARGET_MODE,
  executionProjectHint = null,
  executionProjectError = null,
  onSelectedExecutionProjectChange,
  onExecutionProjectVSCodePreferenceChange,
  onSelectedExecutionTargetModeChange,
  missionExecutionLabel = null,
  contextProjects,
  contextActionLabel = null,
  onContextAction,
  missionActionLabel = null,
  onMissionAction,
  availableOperations,
  selectedOperation,
  activeOperationState,
  workflowProgress = null,
  liveDraft = null,
  isOperationSelectionLocked,
  onSelectedOperationChange,
  onAbort,
  onSend,
  showAbortAction = false,
  headerTitle = "Regalia Command Center",
  headerSubtitle = "Noctis Lucis Caelum - Direct Line",
  primaryAgentId = "noctis",
  primaryAgentAvatarSrc = "/images/noctis.png",
  primaryAgentLabel = "Noctis",
  failedDeliveryNotice = null,
  composerStatusLabel = null,
  composerPlaceholder,
  startingMissionDescription = "Preparing mission and briefing Noctis.",
}: ChatAreaProps) => {
  const isMissionStartPending = isStartingMission && showExecutionProjectSelector;
  const isTranscriptLoading = historyPhase === "loading";
  const isAbortSettling = abortSettlementPhase !== "idle";
  const isTranscriptEmpty = historyPhase === "empty";
  const isTranscriptError = historyPhase === "error";
  const isRetainedHistoryActive = retainedHistory?.isActive ?? false;
  const presentationMessages = useMemo(
    () => messages.map(toSessionPresentationMessage),
    [messages],
  );
  const streamingText = useMemo(
    () =>
      streamingContent
        ? {
            content: streamingContent,
            fallbackSender: primaryAgentId,
            fallbackSenderLabel: primaryAgentLabel,
          }
        : null,
    [primaryAgentId, primaryAgentLabel, streamingContent],
  );
  const renderLiveDraft = useMemo(
    () =>
      liveDraft && liveDraft.parts.length > 0
        ? {
            fallbackSender: primaryAgentId,
            fallbackSenderLabel: primaryAgentLabel,
            messageId: liveDraft.messageId,
            parts: liveDraft.parts,
          }
        : null,
    [liveDraft, primaryAgentId, primaryAgentLabel],
  );
  const renderSnapshot = useSessionChatRenderSnapshot({
    assistantPending: isSessionActive,
    continuityAssistant: {
      sender: primaryAgentId ?? null,
      senderLabel: primaryAgentLabel ?? null,
    },
    currentStreamingMessageId,
    liveDraft: renderLiveDraft,
    messages: presentationMessages,
    onStreamingMessageCommitted,
    streamingText,
  });
  const hasVisibleTranscriptContent =
    renderSnapshot.renderedMessages.length > 0 ||
    renderSnapshot.streamingMessage !== null ||
    renderSnapshot.showPendingIndicator;
  const inspectability = useConversationUnitInspectability(
    renderSnapshot.inspectabilityBoundaries,
  );
  const workingParty = useChatStore((state) => state.workingParty);
  const composerSummary = useMemo(() => {
    if (composerStatusLabel) {
      return composerStatusLabel;
    }

    const allowedWorkers = getAllowedWorkers(workingParty);
    return getWorkingPartySummary(allowedWorkers);
  }, [composerStatusLabel, workingParty]);
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
    [availableOperations],
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
  const operationBadgeLabel = selectedOperationOption?.label ?? "Operation unavailable";
  const operationPlaceholder = isOperationSelectionLocked
    ? "Operation unavailable"
    : defaultOperation.label;
  const startedMissionChipClass =
    "inline-flex max-w-full items-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-3 py-1.5 text-[11px] shadow-sm";
  const missionStartPendingCallout = isMissionStartPending ? (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="overflow-hidden rounded-xl border border-amber-400/20 bg-amber-400/8"
      role="status"
    >
      <div className="mission-start-loading-progress h-px bg-amber-300/10" />
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="relative h-12 w-20 shrink-0" aria-hidden="true">
          <div className="mission-start-loading-glow absolute left-1/2 top-1/2 h-10 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full" />
          <div className="mission-start-loading-ground absolute inset-x-1 bottom-1 h-px" />
          <div className="mission-start-loading-track absolute inset-x-2 bottom-1 h-10">
            <span className="mission-start-loading-dust mission-start-loading-dust-1" />
            <span className="mission-start-loading-dust mission-start-loading-dust-2" />
            <span className="mission-start-loading-dust mission-start-loading-dust-3" />
            <div className="mission-start-loading-chocobo">
              <img
                alt=""
                className="mission-start-loading-chocobo-sprite h-10 w-10"
                src="/images/chocobo.png"
                style={{ imageRendering: "pixelated" }}
              />
            </div>
          </div>
        </div>
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-100/75">
            Starting Mission
          </p>
          <p className="text-xs leading-relaxed text-foreground/85">
            {startingMissionDescription}
          </p>
        </div>
      </div>
    </div>
  ) : null;
  const historyLoadingCallout = useMemo(
    () =>
      isLoadingHistory && !hasVisibleTranscriptContent ? (
        <div aria-atomic="true" aria-live="polite" className="flex justify-center py-4" role="status">
          <div
            aria-busy="true"
            className="transcript-loading-capsule relative inline-flex items-center justify-center px-2 py-2"
          >
            <div className="transcript-loading-glow absolute inset-[-0.9rem]" aria-hidden="true" />
            <div className="relative flex items-center gap-3.5" aria-hidden="true">
              <span className="transcript-loading-dot transcript-loading-dot-1" />
              <span className="transcript-loading-dot transcript-loading-dot-2" />
              <span className="transcript-loading-dot transcript-loading-dot-3" />
            </div>
            <span className="sr-only">Loading mission transcript</span>
          </div>
        </div>
      ) : null,
    [hasVisibleTranscriptContent, isLoadingHistory],
  );
  const historyEmptyCallout = useMemo(
    () =>
      isTranscriptEmpty && !hasVisibleTranscriptContent ? (
        <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2.5" role="status">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/80">
            No Session History Yet
          </p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/75">
            This mission has not produced a transcript yet.
          </p>
        </div>
      ) : null,
    [hasVisibleTranscriptContent, isTranscriptEmpty],
  );
  const historyErrorCallout = useMemo(
    () =>
      isTranscriptError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5" role="alert">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-destructive/90">
            Transcript Load Failed
          </p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/80">
            {historyErrorMessage ?? "Unable to load the mission transcript right now."}
          </p>
        </div>
      ) : null,
    [historyErrorMessage, isTranscriptError],
  );
  const historyRetentionCallout = useMemo(
    () =>
      isRetainedHistoryActive ? (
        <div className="rounded-xl border border-sky-400/25 bg-sky-400/8 px-3 py-2.5" role="status">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-100/85">
            Recent History Only
          </p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/80">
            Only recent mission transcript history is currently retained in this live session.
          </p>
          {retainedHistory && retainedHistory.trimmedConversationUnitCount > 0 ? (
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/85">
              {retainedHistory.trimmedConversationUnitCount} earlier transcript turns are hidden until
              transcript ownership resets.
            </p>
          ) : null}
        </div>
      ) : null,
    [isRetainedHistoryActive, retainedHistory],
  );
  const abortSettlementCallout = isAbortSettling ? (
    <div
      aria-atomic="true"
      aria-live="polite"
      className={cn(
        "rounded-xl border px-3 py-2.5",
        abortSettlementPhase === "delayed"
          ? "border-amber-400/30 bg-amber-400/10"
          : "border-primary/20 bg-primary/8",
      )}
      role="status"
    >
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-foreground/80">
        {abortSettlementPhase === "delayed" ? "Still Waiting for Session Idle" : "Stopping Response"}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-foreground/80">
        {abortSettlementPhase === "delayed"
          ? "Stopping is taking longer than usual. Keep editing your next prompt; send will re-enable when the managed session becomes idle."
          : "Waiting for the managed session to become idle before sending again."}
      </p>
    </div>
  ) : null;
  const failedDeliveryCallout = failedDeliveryNotice ? (
    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5" role="status">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-100/90">
            Delivery failed
          </p>
          <p className="text-xs leading-relaxed text-foreground/85">{failedDeliveryNotice.reason}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={failedDeliveryNotice.isResending}
          onClick={failedDeliveryNotice.onResend}
        >
          {failedDeliveryNotice.isResending ? "Resending..." : "Resend"}
        </Button>
      </div>
    </div>
  ) : null;
  const workflowSelector = (
    <Select
      disabled={isOperationSelectionLocked || isMissionStartPending}
      value={operationSelectValue}
      onValueChange={onSelectedOperationChange}
    >
      <SelectTrigger className="h-9 bg-background/70 font-mono text-xs uppercase tracking-[0.14em]">
        <SelectValue placeholder={operationPlaceholder} />
      </SelectTrigger>
      <SelectContent>
        {availableOperations.map((operation) => (
          <SelectItem key={operation.value} value={operation.value}>
            {operation.description ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center">{operation.label}</span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-80 text-xs leading-relaxed">
                  {operation.description}
                </TooltipContent>
              </Tooltip>
            ) : (
              operation.label
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <ChatThreadFrame
      autoFollowKey={renderSnapshot.autoFollowKey}
      header={
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-border/50 border-b px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center">
              <img
                alt="FF15"
                className="h-6 w-6 object-contain"
                src="/images/sword-32x32.png"
              />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-sm tracking-[0.15em] text-foreground uppercase">
                {headerTitle}
              </h1>
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
                {headerSubtitle}
              </p>
            </div>

            {workflowProgress ? <WorkflowProgressSummary workflowProgress={workflowProgress} /> : null}
          </div>
        </div>
      }
      footer={
        <PromptComposer
          draftKey={composerDraftKey ?? sessionId ?? undefined}
          onSend={onSend}
          onAbort={onAbort}
          disableSendAction={isMissionStartPending || isTranscriptLoading || isAbortSettling}
          showAbortAction={showAbortAction}
          topSlot={
            <div className="space-y-3">
              {abortSettlementCallout}
              {failedDeliveryCallout}
              {showExecutionProjectSelector ? (
                <div className="space-y-3">
                  {missionStartPendingCallout}
                  <div className={cn("grid gap-3", showWorkflowSelector && "sm:grid-cols-2")}>
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
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <Select
                            disabled={isMissionStartPending}
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
                        </div>

                        {executionProjectLaunchPath ? (
                          <WorkspaceLaunchActions
                            path={executionProjectLaunchPath}
                            vscodePreference={executionProjectVSCodePreference}
                            onVSCodePreferenceChange={onExecutionProjectVSCodePreferenceChange}
                          />
                        ) : null}
                      </div>
                      {executionProjectError ? (
                        <p className="text-[11px] text-destructive">{executionProjectError}</p>
                      ) : null}
                    </div>

                    {showWorkflowSelector ? (
                      <div className="space-y-1">
                        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/65">
                          Operation
                        </p>
                        {workflowSelector}
                      </div>
                    ) : null}
                  </div>

                  {contextProjects.length > 0 || (contextActionLabel && onContextAction) ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                          Context
                        </p>
                        <ContextProjectBadges projects={contextProjects} />
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {onSelectedExecutionTargetModeChange ? (
                          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-2.5 py-1">
                            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/75">
                              {EXECUTION_MODE_TOGGLE_LABEL}
                            </span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  aria-label="Execution mode help"
                                  className="h-4 w-4 rounded-full border border-border/50 p-0 font-mono text-[10px] text-muted-foreground/80"
                                  size="icon"
                                  type="button"
                                  variant="ghost"
                                >
                                  <Info className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-72 text-xs leading-relaxed">
                                {EXECUTION_MODE_TOOLTIP_COPY}
                              </TooltipContent>
                            </Tooltip>
                            <Switch
                              aria-label="Toggle dedicated workspace"
                              checked={selectedExecutionTargetMode === "mission_workspace"}
                              disabled={isMissionStartPending}
                              onCheckedChange={(checked) =>
                                onSelectedExecutionTargetModeChange(
                                  checked ? "mission_workspace" : "execution_project",
                                )
                              }
                            />
                          </div>
                        ) : null}

                        {contextActionLabel && onContextAction ? (
                          <MissionContextActionButton label={contextActionLabel} onClick={onContextAction} />
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : isOperationSelectionLocked ? (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {missionExecutionLabel ? (
                      <span className={startedMissionChipClass}>
                        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary/70">
                          Execution
                        </span>
                        <span className="truncate font-semibold text-foreground">{missionExecutionLabel}</span>
                      </span>
                    ) : null}
                    <div className={startedMissionChipClass}>
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary/70">
                        Context
                      </span>
                      <ContextProjectBadges projects={contextProjects} tone="mission" />
                    </div>
                    {showWorkflowSelector ? (
                      <span className={startedMissionChipClass}>
                        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary/70">
                          Operation
                        </span>
                        <span className="truncate font-semibold text-foreground">{operationBadgeLabel}</span>
                      </span>
                    ) : null}
                  </div>

                  {missionActionLabel && onMissionAction ? (
                    <MissionContextActionButton label={missionActionLabel} onClick={onMissionAction} />
                  ) : null}
                </div>
              ) : showWorkflowSelector ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/65">
                      Operation
                    </p>
                    <p className="text-xs text-muted-foreground/75">
                      {`${defaultOperation.label} is selected unless you choose another operation.`}
                    </p>
                  </div>

                  <div className="w-full sm:max-w-56">{workflowSelector}</div>
                </div>
              ) : null}
            </div>
          }
          footerStart={
            <div className="inline-flex max-w-full items-center rounded-full border border-border/60 bg-background/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
              <span className="truncate">{composerSummary}</span>
            </div>
          }
          placeholder={composerPlaceholder ?? `Send a message to ${primaryAgentLabel}`}
          helperText="Enter sends · Shift+Enter adds a new line · @ files · / skills"
        />
      }
      contentClassName="mx-auto w-full min-w-0 max-w-3xl space-y-5 overflow-x-hidden"
      scrollSignal={renderSnapshot.scrollSignal}
    >
      {(viewportRef) => (
        <TranscriptBody
          getExpandedDetailEntries={inspectability.getExpandedDetailEntries}
          historyEmptyCallout={historyEmptyCallout}
          historyErrorCallout={historyErrorCallout}
          historyLoadingCallout={historyLoadingCallout}
          historyRetentionCallout={historyRetentionCallout}
          isConversationUnitExpanded={inspectability.isConversationUnitExpanded}
          isStreaming={isStreaming}
          onToggleConversationUnit={inspectability.toggleConversationUnit}
          onToggleDetailEntry={inspectability.toggleDetailEntry}
          primaryAgentAvatarSrc={primaryAgentAvatarSrc}
          primaryAgentId={primaryAgentId}
          primaryAgentLabel={primaryAgentLabel}
          renderSnapshot={renderSnapshot}
          sessionId={sessionId}
          viewportRef={viewportRef}
        />
      )}
    </ChatThreadFrame>
  );
};

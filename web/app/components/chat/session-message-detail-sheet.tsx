import { ArrowUpRight, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  extractReasoning,
  extractText,
  extractTools,
} from "@/lib/chat-message-parts";
import {
  getPromptContextSourceLabel,
  type WorkflowMessagePresentation,
} from "@/lib/chat-workflow-presentation";
import { getModelKey } from "@/lib/model-variant-selection";
import type { MessageDetailState, MessageInfo, MessagePart } from "@/lib/opencode-session-types";
import {
  buildRenderedSessionMessages,
  normalizeSessionMessages,
  resolveSessionMessageDisplay,
  type SessionMessageDisplay,
} from "@/lib/session-message-presentation";
import { getActivityActorLabel } from "@/lib/team-message-format";
import type { ActivityActorId } from "@/lib/types/mission";
import { MessageDetailSheetBase } from "./message-detail-sheet-base";
import { MessageMarkdown } from "./message-markdown";

type SessionMessageDetailSheetProps = {
  content: string;
  detailState?: MessageDetailState;
  fallbackSender: ActivityActorId | null;
  fallbackSenderLabel: string;
  messageDisplay?: SessionMessageDisplay;
  messageIds?: string[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  parts?: MessagePart[];
  rawTextContent?: string;
  sessionId?: string | null;
  workflowPresentation?: WorkflowMessagePresentation | null;
};

function formatSelectionAgent(agent: string | null | undefined): string {
  return agent?.trim() ? agent : "Not specified";
}

function formatSelectionModel(
  selection: NonNullable<SessionMessageDisplay["selectionAdjustment"]>["requested"],
): string {
  const modelKey = getModelKey(selection.model);
  if (!modelKey) {
    return "Not specified";
  }

  return selection.model?.variant ? `${modelKey} (${selection.model.variant})` : modelKey;
}

function formatToolStateValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function resolveRawMessagePayload(messageDisplay: SessionMessageDisplay): string | null {
  if (messageDisplay.rawPromptPayload?.trim()) {
    return messageDisplay.rawPromptPayload;
  }

  if (messageDisplay.rawWorkflowPrompt?.trim()) {
    return messageDisplay.rawWorkflowPrompt;
  }

  return null;
}

function useHydratedSessionMessageDetail({
  detailState,
  fallbackSender,
  fallbackSenderLabel,
  messageIds,
  open,
  sessionId,
}: {
  detailState?: MessageDetailState;
  fallbackSender: ActivityActorId | null;
  fallbackSenderLabel: string;
  messageIds?: string[];
  open: boolean;
  sessionId?: string | null;
}) {
  const [loadedMessages, setLoadedMessages] = useState<MessageInfo[] | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  useEffect(() => {
    if (
      !open ||
      detailState !== "summary" ||
      !sessionId ||
      !messageIds ||
      messageIds.length === 0
    ) {
      setLoadedMessages(null);
      setIsLoadingDetail(false);
      return;
    }

    let cancelled = false;
    setIsLoadingDetail(true);

    void Promise.all(
      messageIds.map(async (messageId) => {
        const response = await fetch(
          `/api/session/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}`,
        );
        if (!response.ok) {
          throw new Error(`message detail failed: ${response.status}`);
        }

        const data = (await response.json()) as { message?: MessageInfo };
        return data.message ?? null;
      }),
    )
      .then((nextMessages) => {
        if (!cancelled) {
          setLoadedMessages(nextMessages.filter((message): message is MessageInfo => message !== null));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedMessages(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingDetail(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detailState, messageIds, open, sessionId]);

  const hydratedRenderedMessage = useMemo(() => {
    if (!loadedMessages || loadedMessages.length === 0) {
      return null;
    }

    const normalizedMessages = normalizeSessionMessages(loadedMessages, {
      assistantSender: fallbackSender,
      assistantSenderLabel: fallbackSenderLabel,
    });
    const renderedMessages = buildRenderedSessionMessages(normalizedMessages, {
      continuityAssistant: {
        sender: fallbackSender,
        senderLabel: fallbackSenderLabel,
      },
    });

    return renderedMessages[0] ?? null;
  }, [fallbackSender, fallbackSenderLabel, loadedMessages]);

  return {
    hydratedRenderedMessage,
    isLoadingDetail,
  };
}

export function SessionMessageDetailSheet({
  content,
  detailState,
  fallbackSender,
  fallbackSenderLabel,
  messageDisplay,
  messageIds,
  onOpenChange,
  open,
  parts,
  rawTextContent,
  sessionId,
  workflowPresentation,
}: SessionMessageDetailSheetProps) {
  const { hydratedRenderedMessage, isLoadingDetail } = useHydratedSessionMessageDetail({
    detailState,
    fallbackSender,
    fallbackSenderLabel,
    messageIds,
    open,
    sessionId,
  });

  const effectiveParts = hydratedRenderedMessage?.parts ?? parts;
  const rawText = useMemo(() => {
    if (hydratedRenderedMessage?.detailRawText?.trim()) {
      return hydratedRenderedMessage.detailRawText;
    }

    if (typeof rawTextContent === "string" && rawTextContent.trim()) {
      return rawTextContent;
    }

    return effectiveParts && effectiveParts.length > 0 ? extractText(effectiveParts) : content;
  }, [content, effectiveParts, hydratedRenderedMessage?.detailRawText, rawTextContent]);
  const reasoning = useMemo(() => extractReasoning(effectiveParts ?? []), [effectiveParts]);
  const tools = useMemo(() => extractTools(effectiveParts ?? []), [effectiveParts]);
  const resolvedMessageDisplay = useMemo(() => {
    if (hydratedRenderedMessage) {
      return hydratedRenderedMessage.messageDisplay;
    }

    if (messageDisplay) {
      return messageDisplay;
    }

    if (workflowPresentation) {
      const resolvedSender = workflowPresentation.visibleBodyFrom ?? fallbackSender;
      const promptContextSections = !workflowPresentation.usedFallback
        ? workflowPresentation.promptContextSections ?? []
        : [];

      return {
        displayContent: workflowPresentation.visibleBody,
        promptContextSections,
        promptContextSource: promptContextSections.length > 0 ? "workflow" : null,
        rawWorkflowPrompt: !workflowPresentation.usedFallback
          ? workflowPresentation.rawPrompt ?? null
          : null,
        rawPromptPayload: !workflowPresentation.usedFallback
          ? workflowPresentation.rawPrompt ?? null
          : null,
        reportDetails: !workflowPresentation.usedFallback
          ? workflowPresentation.reportDetails ?? null
          : null,
        selectionAdjustment: null,
        resolvedSender,
        resolvedSenderIsUser: resolvedSender === "user",
        resolvedSenderLabel: resolvedSender
          ? getActivityActorLabel(resolvedSender)
          : fallbackSenderLabel,
        workflowPresentation,
      } satisfies SessionMessageDisplay;
    }

    return resolveSessionMessageDisplay({
      rawText,
      fallbackSender,
      fallbackSenderLabel,
    });
  }, [
    fallbackSender,
    fallbackSenderLabel,
    hydratedRenderedMessage,
    messageDisplay,
    rawText,
    workflowPresentation,
  ]);

  const copyContent = resolvedMessageDisplay.displayContent.trim()
    ? resolvedMessageDisplay.displayContent
    : "";
  const hasVisibleBody = resolvedMessageDisplay.displayContent.trim().length > 0;
  const rawMessagePayload = resolveRawMessagePayload(resolvedMessageDisplay);
  const hasIntermediateDetails =
    reasoning.trim().length > 0 ||
    tools.length > 0 ||
    Boolean(resolvedMessageDisplay.reportDetails?.trim()) ||
    resolvedMessageDisplay.promptContextSections.length > 0 ||
    Boolean(rawMessagePayload?.trim());
  const selectionAdjustment = resolvedMessageDisplay.selectionAdjustment;

  return (
    <MessageDetailSheetBase
      copyContent={copyContent}
      description="Full message view"
      onOpenChange={onOpenChange}
      open={open}
      title={`${resolvedMessageDisplay.resolvedSenderLabel} message detail`}
    >
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/3 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-slate-300">
        <ArrowUpRight className="h-3.5 w-3.5" />
        {resolvedMessageDisplay.resolvedSenderLabel}
      </div>

      {isLoadingDetail ? (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/3 px-4 py-3 text-[12px] text-slate-300">
          Loading full message detail...
        </div>
      ) : null}

      {hasVisibleBody ? (
        <div className="rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5">
          {resolvedMessageDisplay.resolvedSenderIsUser ? (
            <p className="whitespace-pre-wrap text-[13px] leading-6 text-slate-100">
              {resolvedMessageDisplay.displayContent}
            </p>
          ) : (
            <div className="markdown-body text-[13px] leading-6 [&_li]:leading-6 [&_p]:leading-6">
              <MessageMarkdown>{resolvedMessageDisplay.displayContent}</MessageMarkdown>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/3 p-4 text-[12px] text-slate-400 sm:p-5">
          {hasIntermediateDetails
            ? "Intermediate activity only."
            : "No final answer text was captured for this message."}
        </div>
      )}

      {selectionAdjustment ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">
            Selection Adjustment
          </div>
          <p className="text-[12px] leading-6 text-slate-200/85">
            {selectionAdjustment.explanation}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                Requested
              </div>
              <div className="mt-2 text-[11px] uppercase tracking-wide text-slate-500">Agent</div>
              <div className="text-[13px] text-slate-100">
                {formatSelectionAgent(selectionAdjustment.requested.agent)}
              </div>
              <div className="mt-3 text-[11px] uppercase tracking-wide text-slate-500">Model</div>
              <div className="text-[13px] text-slate-100">
                {formatSelectionModel(selectionAdjustment.requested)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                Actual
              </div>
              <div className="mt-2 text-[11px] uppercase tracking-wide text-slate-500">Agent</div>
              <div className="text-[13px] text-slate-100">
                {formatSelectionAgent(selectionAdjustment.actual.agent)}
              </div>
              <div className="mt-3 text-[11px] uppercase tracking-wide text-slate-500">Model</div>
              <div className="text-[13px] text-slate-100">
                {formatSelectionModel(selectionAdjustment.actual)}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {resolvedMessageDisplay.reportDetails ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">
            Report Details
          </div>
          <p className="whitespace-pre-wrap text-[13px] leading-6 text-slate-100/90">
            {resolvedMessageDisplay.reportDetails}
          </p>
        </div>
      ) : null}

      {resolvedMessageDisplay.promptContextSections.length > 0 ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">
            <FileText className="h-3.5 w-3.5" />
            Prompt Context
            {resolvedMessageDisplay.promptContextSource ? (
              <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[9px] text-slate-300">
                {getPromptContextSourceLabel(resolvedMessageDisplay.promptContextSource)}
              </span>
            ) : null}
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {resolvedMessageDisplay.promptContextSections.map((section) => (
              <span
                className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-100/85"
                key={section.key}
              >
                {section.label}
              </span>
            ))}
          </div>
          <div className="space-y-3">
            {resolvedMessageDisplay.promptContextSections.map((section) => (
              <details
                className="rounded-xl border border-white/10 bg-black/20 p-3"
                key={section.key}
              >
                <summary className="cursor-pointer text-sm font-medium text-slate-100">
                  {section.label}
                  {section.preview ? (
                    <span className="ml-2 text-[11px] font-normal text-slate-400">
                      {section.preview}
                    </span>
                  ) : null}
                </summary>
                <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-[11px] text-slate-100/85">
                  {section.content}
                </pre>
              </details>
            ))}
          </div>
        </div>
      ) : null}

      {rawMessagePayload ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">
            Raw Message Payload
          </div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-[11px] text-slate-100/85">
            {rawMessagePayload}
          </pre>
        </div>
      ) : null}

      {reasoning ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">
            Commentary
          </div>
          <p className="whitespace-pre-wrap text-[13px] leading-6 text-slate-100/90">{reasoning}</p>
        </div>
      ) : null}

      {tools.length > 0 ? (
        <div className="mt-4 space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
            Tool Activity
          </div>
          {tools.map((tool, index) => (
            <div
              className="rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5"
              key={tool.detailId ?? `${tool.tool ?? "tool"}:${index}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-slate-100">{tool.tool ?? "Tool"}</div>
                {tool.state?.status ? (
                  <div className="text-[11px] text-slate-400">{tool.state.status}</div>
                ) : null}
              </div>

              {tool.state?.input ? (
                <div className="mt-3">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-slate-400">
                    Input
                  </div>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-[11px] text-slate-100/85">
                    {formatToolStateValue(tool.state.input)}
                  </pre>
                </div>
              ) : null}

              {tool.state?.output ? (
                <div className="mt-3">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-slate-400">
                    Output
                  </div>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-[11px] text-slate-100/85">
                    {formatToolStateValue(tool.state.output)}
                  </pre>
                </div>
              ) : null}

              {tool.state?.error ? (
                <div className="mt-3">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-slate-400">
                    Error
                  </div>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-red-400/20 bg-red-950/20 p-3 font-mono text-[11px] text-red-200/90">
                    {tool.state.error}
                  </pre>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </MessageDetailSheetBase>
  );
}
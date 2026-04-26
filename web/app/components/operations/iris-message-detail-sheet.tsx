import { ArrowUpRight, FileText } from "lucide-react";
import { useMemo, useRef } from "react";
import { MessageDetailSheetBase } from "@/components/chat/message-detail-sheet-base";
import { MessageMarkdown } from "@/components/chat/message-markdown";
import { extractReasoning, extractTools } from "@/lib/chat-message-parts";
import { getPromptContextSourceLabel } from "@/lib/chat-workflow-presentation";
import { getModelKey } from "@/lib/model-variant-selection";
import type { RenderedSessionMessage } from "@/lib/session-message-presentation";

function formatSelectionAgent(agent: string | null | undefined): string {
  return agent?.trim() ? agent : "Not specified";
}

function formatSelectionModel(selection: NonNullable<RenderedSessionMessage["messageDisplay"]["selectionAdjustment"]>["requested"]): string {
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

type IrisMessageDetailSheetProps = {
  message: RenderedSessionMessage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function IrisMessageDetailSheet({
  message,
  onOpenChange,
  open,
}: IrisMessageDetailSheetProps) {
  const toolKeyMapRef = useRef(new WeakMap<object, string>());
  const nextToolKeyRef = useRef(0);
  const messageDisplay = message.messageDisplay;
  const reasoning = useMemo(() => extractReasoning(message.parts), [message.parts]);
  const tools = useMemo(() => extractTools(message.parts), [message.parts]);
  const copyContent = messageDisplay.displayContent.trim() ? messageDisplay.displayContent : "";
  const hasVisibleBody = messageDisplay.displayContent.trim().length > 0;
  const selectionAdjustment = messageDisplay.selectionAdjustment;
  const hasIntermediateDetails =
    reasoning.trim().length > 0 ||
    tools.length > 0 ||
    Boolean(messageDisplay.reportDetails?.trim()) ||
    messageDisplay.promptContextSections.length > 0 ||
    Boolean(messageDisplay.rawPromptPayload?.trim());

  const getToolKey = (tool: object) => {
    const existingKey = toolKeyMapRef.current.get(tool);
    if (existingKey) {
      return existingKey;
    }

    nextToolKeyRef.current += 1;
    const nextKey = `tool-${nextToolKeyRef.current}`;
    toolKeyMapRef.current.set(tool, nextKey);
    return nextKey;
  };

  return (
    <MessageDetailSheetBase
      copyContent={copyContent}
      description="Full message view"
      onOpenChange={onOpenChange}
      open={open}
      title={`${messageDisplay.resolvedSenderLabel} message detail`}
    >
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/3 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-slate-300">
        <ArrowUpRight className="h-3.5 w-3.5" />
        {messageDisplay.resolvedSenderLabel}
      </div>

      {hasVisibleBody ? (
        <div className="rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5">
          {messageDisplay.resolvedSenderIsUser ? (
            <p className="whitespace-pre-wrap text-[13px] leading-6 text-slate-100">
              {messageDisplay.displayContent}
            </p>
          ) : (
            <div className="markdown-body text-[13px] leading-6 [&_li]:leading-6 [&_p]:leading-6">
              <MessageMarkdown>{messageDisplay.displayContent}</MessageMarkdown>
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

      {messageDisplay.reportDetails ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">
            Report Details
          </div>
          <p className="whitespace-pre-wrap text-[13px] leading-6 text-slate-100/90">
            {messageDisplay.reportDetails}
          </p>
        </div>
      ) : null}

      {messageDisplay.promptContextSections.length > 0 ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">
            <FileText className="h-3.5 w-3.5" />
            Prompt Context
            {messageDisplay.promptContextSource ? (
              <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[9px] text-slate-300">
                {getPromptContextSourceLabel(messageDisplay.promptContextSource)}
              </span>
            ) : null}
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {messageDisplay.promptContextSections.map((section) => (
              <span
                className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-100/85"
                key={section.key}
              >
                {section.label}
              </span>
            ))}
          </div>
          <div className="space-y-3">
            {messageDisplay.promptContextSections.map((section) => (
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

      {messageDisplay.rawPromptPayload?.trim() ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5">
          <details>
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-slate-400">
              Raw Prompt Payload
            </summary>
            <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-[11px] text-slate-100/85">
              {messageDisplay.rawPromptPayload}
            </pre>
          </details>
        </div>
      ) : null}

      {reasoning ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">
            Commentary
          </div>
          <p className="whitespace-pre-wrap text-[13px] leading-6 text-slate-100/90">
            {reasoning}
          </p>
        </div>
      ) : null}

      {tools.length > 0 ? (
        <div className="mt-4 space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
            Tool Activity
          </div>
          {tools.map((tool) => (
            <div
              className="rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5"
              key={getToolKey(tool)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-slate-100">{tool.tool ?? "Tool"}</div>
                {tool.state?.status ? (
                  <div className="text-[11px] text-slate-400">{tool.state.status}</div>
                ) : null}
              </div>

              {tool.state?.input ? (
                <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-[11px] text-slate-100/85">
                  {formatToolStateValue(tool.state.input)}
                </pre>
              ) : null}

              {tool.state?.output ? (
                <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-[11px] text-slate-100/85">
                  {formatToolStateValue(tool.state.output)}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </MessageDetailSheetBase>
  );
}
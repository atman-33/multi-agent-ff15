import { ArrowUpRight, FileText } from "lucide-react";
import { useMemo, useRef } from "react";
import { MessageMarkdown } from "@/components/chat/message-markdown";
import { MessageDetailSheetBase } from "@/components/chat/message-detail-sheet-base";
import {
  parseWorkflowMessagePresentation,
  type WorkflowMessagePresentation,
} from "@/lib/chat-workflow-presentation";
import { getActivityActorLabel } from "@/lib/team-message-format";
import type { ActivityActorId } from "@/lib/types/mission";
import type { MessagePart } from "@/routes/_layout.opencode.session.$id/types";
import { removeInternalContext } from "./internal-context";
import { buildMessageMarkdown, extractReasoning, extractText, extractTools } from "./message-parts";

type Props = {
  content: string;
  rawTextContent?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  parts?: MessagePart[];
  sender: ActivityActorId;
  workflowPresentation?: WorkflowMessagePresentation | null;
};

const MessageDetailSheet = ({
  content,
  rawTextContent,
  onOpenChange,
  open,
  parts,
  sender,
  workflowPresentation,
}: Props) => {
  const toolKeyMapRef = useRef(new WeakMap<MessagePart, string>());
  const nextToolKeyRef = useRef(0);
  const rawText = useMemo(() => {
    if (typeof rawTextContent === "string" && rawTextContent.trim()) {
      return rawTextContent;
    }

    return sender === "noctis" && parts && parts.length > 0 ? extractText(parts) : content;
  }, [content, parts, rawTextContent, sender]);
  const reasoning = useMemo(() => extractReasoning(parts ?? []), [parts]);
  const tools = useMemo(() => extractTools(parts ?? []), [parts]);
  const resolvedWorkflowPresentation = useMemo(
    () => workflowPresentation ?? parseWorkflowMessagePresentation(rawText),
    [rawText, workflowPresentation],
  );
  const reportDetails = !resolvedWorkflowPresentation?.usedFallback
    ? resolvedWorkflowPresentation?.reportDetails ?? null
    : null;
  const workflowPromptSections = !resolvedWorkflowPresentation?.usedFallback
    ? resolvedWorkflowPresentation?.workflowPromptSections ?? []
    : [];
  const rawWorkflowPrompt = !resolvedWorkflowPresentation?.usedFallback
    ? resolvedWorkflowPresentation?.rawPrompt ?? null
    : null;

  const getToolKey = (tool: MessagePart) => {
    const existingKey = toolKeyMapRef.current.get(tool);
    if (existingKey) {
      return existingKey;
    }

    nextToolKeyRef.current += 1;
    const nextKey = `tool-${nextToolKeyRef.current}`;
    toolKeyMapRef.current.set(tool, nextKey);
    return nextKey;
  };

  const displayContent = useMemo(
    () =>
      resolvedWorkflowPresentation
        ? resolvedWorkflowPresentation.visibleBody
        : sender === "noctis"
          ? removeInternalContext(rawText)
          : content,
    [content, rawText, resolvedWorkflowPresentation, sender],
  );
  const displaySender = useMemo(
    () => resolvedWorkflowPresentation?.visibleBodyFrom ?? sender,
    [resolvedWorkflowPresentation, sender],
  );
  const senderLabel = useMemo(() => getActivityActorLabel(displaySender), [displaySender]);
  const copyContent = useMemo(
    () => buildMessageMarkdown(displayContent, reasoning, tools),
    [displayContent, reasoning, tools],
  );
  const hasVisibleBody = displayContent.trim().length > 0;
  const hasIntermediateDetails =
    reasoning.trim().length > 0 ||
    tools.length > 0 ||
    Boolean(reportDetails?.trim()) ||
    workflowPromptSections.length > 0 ||
    Boolean(rawWorkflowPrompt?.trim());

  return (
    <MessageDetailSheetBase
      copyContent={copyContent}
      description="Full message view"
      onOpenChange={onOpenChange}
      open={open}
      title={`${senderLabel} message detail`}
    >
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/3 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-slate-300">
        <ArrowUpRight className="h-3.5 w-3.5" />
        {senderLabel}
      </div>

      {hasVisibleBody ? (
        <div className="rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5">
          {displaySender === "user" ? (
            <p className="whitespace-pre-wrap text-[13px] leading-6 text-slate-100">
              {displayContent}
            </p>
          ) : (
            <div className="markdown-body text-[13px] leading-6 [&_li]:leading-6 [&_p]:leading-6">
              <MessageMarkdown>{displayContent}</MessageMarkdown>
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

      {reportDetails ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">
            Report Details
          </div>
          <p className="whitespace-pre-wrap text-[13px] leading-6 text-slate-100/90">
            {reportDetails}
          </p>
        </div>
      ) : null}

      {workflowPromptSections.length > 0 ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">
            <FileText className="h-3.5 w-3.5" />
            Workflow Prompt
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {workflowPromptSections.map((section) => (
              <span
                key={section.key}
                className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-100/85"
              >
                {section.label}
              </span>
            ))}
          </div>
          <div className="space-y-3">
            {workflowPromptSections.map((section) => (
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
                  {JSON.stringify(tool.state.input, null, 2)}
                </pre>
              ) : null}

              {tool.state?.output ? (
                <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-[11px] text-slate-100/85">
                  {tool.state.output}
                </pre>
              ) : null}

              {tool.state?.error ? (
                <div className="mt-3 text-sm text-red-300">{tool.state.error}</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {rawWorkflowPrompt ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5">
          <details className="rounded-xl border border-white/10 bg-black/20 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-100">
              Raw Operation Prompt
            </summary>
            <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-[11px] text-slate-100/85">
              {rawWorkflowPrompt}
            </pre>
          </details>
        </div>
      ) : null}
    </MessageDetailSheetBase>
  );
};

export default MessageDetailSheet;

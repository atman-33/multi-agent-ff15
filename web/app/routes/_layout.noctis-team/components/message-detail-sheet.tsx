import { ArrowUpRight, BadgeInfo, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { MessageDetailSheetBase } from "@/components/chat/message-detail-sheet-base";
import { getActivityActorLabel } from "@/lib/team-message-format";
import type { ActivityActorId } from "@/lib/types/mission";
import { cn } from "@/lib/utils";
import type { MessagePart } from "@/routes/_layout.opencode.session.$id/types";
import { parseInternalContext, removeInternalContext } from "./internal-context";
import { buildMessageMarkdown, extractReasoning, extractText, extractTools } from "./message-parts";

type Props = {
  content: string;
  rawTextContent?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  parts?: MessagePart[];
  sender: ActivityActorId;
};

const MessageDetailSheet = ({ content, rawTextContent, onOpenChange, open, parts, sender }: Props) => {
  const [contextExpanded, setContextExpanded] = useState(false);
  const rawText = useMemo(
    () => {
      if (typeof rawTextContent === "string" && rawTextContent.trim()) {
        return rawTextContent;
      }

      return sender === "noctis" && parts && parts.length > 0 ? extractText(parts) : content;
    },
    [content, parts, rawTextContent, sender]
  );
  const reasoning = useMemo(() => extractReasoning(parts ?? []), [parts]);
  const tools = useMemo(() => extractTools(parts ?? []), [parts]);
  const internalContext = useMemo(() => parseInternalContext(rawText), [rawText]);
  const displayContent = useMemo(
    () => (sender === "noctis" ? removeInternalContext(rawText) : content),
    [content, rawText, sender]
  );
  const senderLabel = useMemo(() => getActivityActorLabel(sender), [sender]);
  const copyContent = useMemo(
    () => buildMessageMarkdown(displayContent, reasoning, tools),
    [displayContent, reasoning, tools]
  );
  const hasVisibleBody = displayContent.trim().length > 0;
  const hasIntermediateDetails = reasoning.trim().length > 0 || tools.length > 0 || internalContext !== null;

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

      {internalContext ? (
        <div className="mb-4 rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-3">
          <button
            className="flex w-full min-w-0 items-center gap-2 text-left"
            onClick={() => setContextExpanded((value) => !value)}
            type="button"
          >
            <BadgeInfo className="h-4 w-4 shrink-0 text-sky-300" />
            <span className="shrink-0 text-xs font-medium text-sky-100">
              Internal Context
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-sky-100/80">
              {internalContext.summary}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-sky-200/70 transition-transform duration-300 ease-out",
                contextExpanded ? "rotate-180" : "rotate-0"
              )}
            />
          </button>

          <div
            className={cn(
              "grid transition-all duration-300 ease-out",
              contextExpanded ? "mt-3 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
            )}
          >
            <div className="overflow-hidden">
              <pre className="overflow-x-auto rounded-lg border border-sky-500/10 bg-black/20 p-3 font-mono text-[11px] whitespace-pre-wrap wrap-break-word text-sky-50/85">
                {internalContext.raw}
              </pre>
            </div>
          </div>
        </div>
      ) : null}

      {hasVisibleBody ? (
        <div className="rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5">
          {sender === "crystal" ? (
            <p className="whitespace-pre-wrap text-[13px] leading-6 text-slate-100">
              {displayContent}
            </p>
          ) : (
            <div className="markdown-body text-[13px] leading-6 [&_li]:leading-6 [&_p]:leading-6">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{displayContent}</ReactMarkdown>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/3 p-4 text-[12px] text-slate-400 sm:p-5">
          {hasIntermediateDetails ? "Intermediate activity only." : "No final answer text was captured for this message."}
        </div>
      )}

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
          {tools.map((tool, index) => (
            <div
              className="rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5"
              key={`${tool.tool ?? "tool"}-${index}`}
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
    </MessageDetailSheetBase>
  );
};

export default MessageDetailSheet;
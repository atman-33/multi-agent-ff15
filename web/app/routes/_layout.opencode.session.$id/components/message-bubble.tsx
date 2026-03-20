import { ArrowUpRight, BadgeInfo, Check, ChevronDown, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import MessageDetailSheet from "./message-detail-sheet";
import type { MessagePart } from "../types";

type Props = {
  role: "user" | "assistant";
  parts: MessagePart[];
  viewportRef: React.RefObject<HTMLDivElement | null>;
};

type InternalContextViewModel = {
  raw: string;
  summary: string;
};

const INTERNAL_CONTEXT_BLOCK_REGEX = /<internal-context>([\s\S]*?)<\/internal-context>/;
const INTERNAL_CONTEXT_REMOVE_REGEX = /<internal-context>[\s\S]*?<\/internal-context>/g;
const INTERNAL_CONTEXT_SESSION_REGEX = /^session_id:\s*(.+)$/m;
const INTERNAL_CONTEXT_SCOPE_REGEX = /^project_scope:\s*(.+)$/m;
const INTERNAL_CONTEXT_PROJECT_ID_REGEX = /^\s*- id:\s*(.+)$/gm;

function parseInternalContext(content: string): InternalContextViewModel | null {
  const match = content.match(INTERNAL_CONTEXT_BLOCK_REGEX);
  if (!match) {
    return null;
  }

  const raw = (match[1] ?? "").trim();
  if (!raw) {
    return {
      raw: "",
      summary: "Injected internal context",
    };
  }

  const sessionId = raw.match(INTERNAL_CONTEXT_SESSION_REGEX)?.[1]?.trim() ?? null;
  const projectScope = raw.match(INTERNAL_CONTEXT_SCOPE_REGEX)?.[1]?.trim() ?? null;
  const projectIds = Array.from(raw.matchAll(INTERNAL_CONTEXT_PROJECT_ID_REGEX)).map((matchItem) =>
    matchItem[1]?.trim()
  ).filter((value): value is string => Boolean(value));

  const summaryParts = [sessionId ? `Session ${sessionId}` : null, projectScope, projectIds[0] ?? null]
    .filter((value): value is string => Boolean(value));
  const extraProjectCount = Math.max(projectIds.length - 1, 0);

  return {
    raw,
    summary:
      summaryParts.length > 0
        ? `${summaryParts.join(" · ")}${extraProjectCount > 0 ? ` +${extraProjectCount}` : ""}`
        : "Injected internal context",
  };
}

function removeInternalContext(content: string): string {
  return content.replace(INTERNAL_CONTEXT_REMOVE_REGEX, "").trim();
}

function buildMessageMarkdown(text: string, reasoning: string, tools: MessagePart[]): string {
  const sections: string[] = [];

  if (text.trim()) {
    sections.push(text.trim());
  }

  if (reasoning.trim()) {
    sections.push(`## Reasoning\n\n${reasoning.trim()}`);
  }

  tools.forEach((tool, index) => {
    const toolSections = [`## Tool ${index + 1}: ${tool.tool ?? "Tool"}`];

    if (tool.state?.status) {
      toolSections.push(`- Status: ${tool.state.status}`);
    }

    if (tool.state?.input) {
      toolSections.push(`### Input\n\n\`\`\`json\n${JSON.stringify(tool.state.input, null, 2)}\n\`\`\``);
    }

    if (tool.state?.output) {
      toolSections.push(`### Output\n\n\`\`\`\n${tool.state.output.trim()}\n\`\`\``);
    }

    if (tool.state?.error) {
      toolSections.push(`### Error\n\n${tool.state.error.trim()}`);
    }

    sections.push(toolSections.join("\n\n"));
  });

  return sections.join("\n\n").trim();
}

const MessageBubble = ({ role, parts, viewportRef }: Props) => {
  const [contextExpanded, setContextExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusedWithin, setIsFocusedWithin] = useState(false);
  const [isFullyVisible, setIsFullyVisible] = useState(true);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const isUser = role === "user";
  const rawText = parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
  const internalContext = useMemo(() => parseInternalContext(rawText), [rawText]);
  const text = useMemo(() => removeInternalContext(rawText), [rawText]);
  const reasoning = parts
    .filter((part) => part.type === "reasoning")
    .map((part) => part.text ?? "")
    .join("");
  const tools = parts.filter((part) => part.type === "tool");
  const messageMarkdown = useMemo(() => buildMessageMarkdown(text, reasoning, tools), [reasoning, text, tools]);
  const showActions = isHovered || isFocusedWithin;
  const useStickyActions = showActions && !isFullyVisible;

  if (!text && !reasoning && tools.length === 0 && !internalContext) {
    return null;
  }

  useEffect(() => {
    const viewport = viewportRef.current;
    const bubble = bubbleRef.current;

    if (!viewport || !bubble) {
      setIsFullyVisible(true);
      return;
    }

    const updateVisibility = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const bubbleRect = bubble.getBoundingClientRect();
      const topInset = 8;
      const bottomInset = 12;
      const fullyVisible =
        bubbleRect.top >= viewportRect.top + topInset &&
        bubbleRect.bottom <= viewportRect.bottom - bottomInset;

      setIsFullyVisible(fullyVisible);
    };

    updateVisibility();

    viewport.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);

    return () => {
      viewport.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, [reasoning, text, tools.length, viewportRef]);

  const handleCopy = () => {
    if (!messageMarkdown) {
      return;
    }

    navigator.clipboard.writeText(messageMarkdown).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className={cn("group/message flex", isUser ? "justify-end" : "justify-start")}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn("flex max-w-[84%] flex-col", isUser ? "items-end" : "items-start")}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsFocusedWithin(false);
          }
        }}
        onFocus={() => setIsFocusedWithin(true)}
      >
        <div
          ref={bubbleRef}
          className={cn(
            "relative w-full rounded-xl border px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur-xs",
            isUser
              ? "rounded-br-md border-sky-500/15 bg-sky-500/8 text-foreground/90"
              : "rounded-bl-md border-border/40 bg-white/4.5 text-foreground"
          )}
        >

        {internalContext ? (
          <div className="mb-3 rounded-md border border-sky-500/20 bg-sky-500/5 px-2.5 py-1.5">
            <button
              className="flex w-full min-w-0 items-center gap-2 text-left"
              onClick={() => setContextExpanded((value) => !value)}
              type="button"
            >
              <BadgeInfo className="h-3.5 w-3.5 shrink-0 text-sky-300" />
              <span className="shrink-0 text-[11px] font-medium text-sky-100">
                Internal Context
              </span>
              <span className="shrink-0 rounded-full border border-sky-500/20 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-200/80">
                Injected
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-sky-100/80">
                {internalContext.summary}
              </span>
              <ChevronDown
                className={cn(
                  "ml-auto h-3 w-3 text-sky-200/70 transition-transform duration-300 ease-out",
                  contextExpanded ? "rotate-180" : "rotate-0"
                )}
              />
            </button>

            <div
              className={cn(
                "grid transition-all duration-300 ease-out",
                contextExpanded ? "mt-2 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
              )}
            >
              <div className="overflow-hidden">
                <div
                  className={cn(
                    "grid gap-2 border-t border-sky-500/10 pt-2 text-[11px] text-sky-50/85 transition-all duration-300 ease-out",
                    contextExpanded ? "translate-y-0" : "-translate-y-1"
                  )}
                >
                  <pre className="overflow-x-auto rounded-lg border border-sky-500/10 bg-black/20 p-3 font-mono text-[11px] whitespace-pre-wrap wrap-break-word text-sky-50/85">
                    {internalContext.raw}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {text &&
          (isUser ? (
            <p className="whitespace-pre-wrap text-[13px] leading-5 text-foreground/90">{text}</p>
          ) : (
            <div className="markdown-body text-[13px] leading-5 [&_li]:leading-5 [&_p]:leading-5 [&_pre]:text-[11px]">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{text}</ReactMarkdown>
            </div>
          ))}

        {reasoning && <p className="mt-2 text-[11px] leading-4 italic text-muted-foreground">{reasoning}</p>}

        {tools.length > 0 && (
          <div className="mt-3 space-y-2">
            {tools.map((tool, index) => (
              <details
                key={`${tool.tool ?? "tool"}-${index}`}
                className="rounded-md border border-border/40 bg-black/10 p-2"
              >
                <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                  {tool.tool ?? "Tool"}
                </summary>
                <div className="mt-2 text-[11px] leading-4 text-muted-foreground">
                  {tool.state?.status && (
                    <div className="mb-1">
                      Status:{" "}
                      <span
                        className={cn(
                          "font-semibold",
                          tool.state.status === "completed" && "text-emerald-400",
                          tool.state.status === "error" && "text-destructive"
                        )}
                      >
                        {tool.state.status}
                      </span>
                    </div>
                  )}
                  {tool.state?.input && (
                    <pre className="whitespace-pre-wrap rounded-md bg-black/10 p-2 text-[11px]">
                      {JSON.stringify(tool.state.input, null, 2)}
                    </pre>
                  )}
                  {tool.state?.output && (
                    <pre className="mt-2 whitespace-pre-wrap rounded-md bg-black/10 p-2 text-[11px]">
                      {tool.state.output}
                    </pre>
                  )}
                  {tool.state?.error && (
                    <div className="mt-2 text-xs text-destructive">{tool.state.error}</div>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}

        <MessageDetailSheet
          content={messageMarkdown}
          onOpenChange={setDetailOpen}
          open={detailOpen}
          role={role}
        />
        </div>

        <div
          className={cn(
            "pointer-events-none z-20 w-full transition-[opacity,transform,height,margin] duration-200",
            showActions ? "opacity-100" : "opacity-0",
            showActions ? "mt-1 h-8" : "mt-0 h-0 overflow-hidden",
            useStickyActions ? "sticky bottom-3 translate-y-0" : "relative"
          )}
        >
          <div className="pointer-events-auto flex justify-start">
            <div className="flex gap-1 rounded-lg bg-slate-950/35 p-1 shadow-sm backdrop-blur-sm">
              <button
                className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] text-slate-200 transition-colors hover:bg-slate-900 hover:text-white"
                onClick={() => setDetailOpen(true)}
                title="Open larger message view"
                type="button"
              >
                <ArrowUpRight className="h-3 w-3" />
                Open detail
              </button>
              <button
                className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] text-slate-200 transition-colors hover:bg-slate-900 hover:text-white"
                onClick={handleCopy}
                title="Copy as markdown"
                type="button"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;

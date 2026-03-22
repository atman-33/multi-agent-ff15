import { ArrowUpRight, BadgeInfo, Check, ChevronDown, Copy, Sparkles, Wrench } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { memo, useMemo, useState } from "react";
import { parseInternalContext, removeInternalContext } from "@/lib/chat-internal-context";
import { buildMessageMarkdown, extractReasoning, extractTools } from "@/lib/chat-message-parts";
import { cn } from "@/lib/utils";
import MessageDetailSheet from "./message-detail-sheet";
import type { MessagePart } from "../types";

type Props = {
  message: {
    id: string;
    role: "user" | "assistant";
    senderLabel: string;
    timestamp: Date;
    parts: MessagePart[];
    showCursor?: boolean;
  };
  viewportRef: React.RefObject<HTMLDivElement | null>;
};

const MessageBubble = ({ message }: Props) => {
  const [contextExpanded, setContextExpanded] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const isUser = message.role === "user";
  const rawText = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
  const internalContext = useMemo(() => parseInternalContext(rawText), [rawText]);
  const text = useMemo(() => removeInternalContext(rawText), [rawText]);
  const reasoning = useMemo(() => extractReasoning(message.parts), [message.parts]);
  const tools = useMemo(() => extractTools(message.parts), [message.parts]);
  const messageMarkdown = useMemo(() => buildMessageMarkdown(text, reasoning, tools), [reasoning, text, tools]);
  const displayContent = message.showCursor ? `${text}▌` : text;
  const copyContent = messageMarkdown.trim() ? messageMarkdown : text;
  const hasDetails = reasoning.trim().length > 0 || tools.length > 0 || internalContext !== null;
  const hasVisibleBody = text.trim().length > 0 || Boolean(message.showCursor);
  const detailSummary = useMemo(() => {
    const segments: string[] = [];

    if (tools.length > 0) {
      segments.push(`${tools.length} tool activit${tools.length === 1 ? "y" : "ies"}`);
    }

    if (reasoning.trim()) {
      segments.push("commentary");
    }

    if (internalContext) {
      segments.push("context");
    }

    return segments.join(" · ") || "Additional context";
  }, [internalContext, reasoning, tools.length]);

  if (!text && !reasoning && tools.length === 0 && !internalContext) {
    return null;
  }

  const handleCopy = () => {
    if (!copyContent.trim()) {
      return;
    }

    navigator.clipboard.writeText(copyContent).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className={cn(
        "group flex min-w-0 max-w-full items-end gap-2",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "flex min-w-0 max-w-[84%] flex-col",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "mb-1 flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-widest",
            isUser ? "text-primary/70" : "text-muted-foreground/65"
          )}
        >
          <span className="font-semibold">{message.senderLabel}</span>
          {message.timestamp.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </div>

        <div
          className={cn(
            "relative min-w-0 max-w-full overflow-x-hidden rounded-2xl border px-4 py-3 text-sm shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur-xs",
            isUser
              ? "rounded-br-md border-primary/20 bg-primary/12 text-foreground"
              : "rounded-bl-md border-border/40 bg-white/6 text-foreground"
          )}
        >
          {hasVisibleBody ? (
            isUser ? (
              <p className="wrap-anywhere whitespace-pre-wrap text-[13px] leading-6 text-foreground/90">
                {text}
                {message.showCursor ? <span className="animate-pulse text-primary">▌</span> : null}
              </p>
            ) : (
              <div className="markdown-body text-[13px] leading-6 [&_li]:leading-6 [&_p]:leading-6 [&_pre]:text-[11px]">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{displayContent}</ReactMarkdown>
              </div>
            )
          ) : (
            <div className="rounded-md border border-dashed border-border/40 bg-black/10 px-2.5 py-2 text-[11px] text-muted-foreground/80">
              Intermediate activity only.
            </div>
          )}

          {hasDetails ? (
            <>
              <div className="mt-3 border-t border-white/10 pt-3">
                <button
                  className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                  onClick={() => setDetailsExpanded((value) => !value)}
                  type="button"
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform duration-300 ease-out",
                      detailsExpanded ? "rotate-180" : "rotate-0"
                    )}
                  />
                  <span className="font-medium">
                    {detailsExpanded ? "Hide intermediate details" : "Show intermediate details"}
                  </span>
                  <span className="text-[10px] text-muted-foreground/70">{detailSummary}</span>
                </button>
              </div>

              <div
                className={cn(
                  "grid transition-all duration-300 ease-out",
                  detailsExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                )}
              >
                <div className="overflow-hidden">
                  <div
                    className={cn(
                      "space-y-3 pt-3 transition-all duration-300 ease-out",
                      detailsExpanded ? "translate-y-0" : "-translate-y-1"
                    )}
                  >
                    {internalContext ? (
                      <section className="rounded-md border border-sky-500/20 bg-sky-500/5 px-2.5 py-1.5">
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
                      </section>
                    ) : null}

                    {reasoning ? (
                      <section className="space-y-2">
                        <div className="flex items-center gap-1.5 font-medium text-[10px] text-muted-foreground/70 uppercase tracking-[0.14em]">
                          <Sparkles className="h-3.5 w-3.5" />
                          Commentary
                        </div>
                        <div className="rounded-md border border-border/30 bg-black/10 px-2.5 py-2 text-[11px] leading-relaxed text-foreground/85">
                          {reasoning}
                        </div>
                      </section>
                    ) : null}

                    {tools.length > 0 ? (
                      <section className="space-y-2">
                        <div className="flex items-center gap-1.5 font-medium text-[10px] text-muted-foreground/70 uppercase tracking-[0.14em]">
                          <Wrench className="h-3.5 w-3.5" />
                          Tool Activity
                        </div>
                        <div className="space-y-2">
                          {tools.map((tool, index) => (
                            <details
                              key={`${tool.tool ?? "tool"}-${index}`}
                              className="rounded-md border border-border/30 bg-black/10 p-2"
                            >
                              <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                                {tool.tool ?? "Tool"}
                              </summary>
                              <div className="mt-2 text-[11px] leading-4 text-muted-foreground">
                                {tool.state?.status ? (
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
                                ) : null}
                                {tool.state?.input ? (
                                  <pre className="whitespace-pre-wrap rounded-md bg-black/10 p-2 text-[11px] text-foreground/85">
                                    {JSON.stringify(tool.state.input, null, 2)}
                                  </pre>
                                ) : null}
                                {tool.state?.output ? (
                                  <pre className="mt-2 whitespace-pre-wrap rounded-md bg-black/10 p-2 text-[11px] text-foreground/85">
                                    {tool.state.output}
                                  </pre>
                                ) : null}
                                {tool.state?.error ? (
                                  <div className="mt-2 text-xs text-destructive">{tool.state.error}</div>
                                ) : null}
                              </div>
                            </details>
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-1 flex h-7 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            onClick={() => setDetailOpen(true)}
            type="button"
          >
            <ArrowUpRight className="h-3 w-3" />
            Open detail
          </button>
          <button
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            onClick={handleCopy}
            type="button"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        {detailOpen ? (
          <MessageDetailSheet
            content={messageMarkdown}
            onOpenChange={setDetailOpen}
            open={detailOpen}
            senderLabel={message.senderLabel}
          />
        ) : null}
      </div>
    </div>
  );
};

export default memo(MessageBubble);

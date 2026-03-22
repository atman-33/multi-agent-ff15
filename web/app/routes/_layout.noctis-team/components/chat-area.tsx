import { ArrowUpRight, BadgeInfo, Check, ChevronDown, Copy, Radio, Sparkles, Wrench } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { memo, useMemo, useState } from "react";
import { PromptComposer } from "@/components/chat/prompt-composer";
import { ChatThreadFrame } from "@/components/chat/thread-frame";
import { Button } from "@/components/ui/button";
import type { PromptPart } from "@/lib/prompt-parts";
import { getActivityActorLabel } from "@/lib/team-message-format";
import type { ActivityActorId, MissionActivityKind } from "@/lib/types/mission";
import { cn } from "@/lib/utils";
import type { MessagePart } from "@/routes/_layout.opencode.session.$id/types";
import { parseInternalContext, removeInternalContext } from "./internal-context";
import { buildMessageMarkdown, extractReasoning, extractText, extractTools } from "./message-parts";
import MessageDetailSheet from "./message-detail-sheet";

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
  onAbort?: () => void;
  onSend: (parts: PromptPart[]) => void | Promise<unknown>;
  showAbortAction?: boolean;
}

interface RenderedChatMessage extends ChatMessage {
  displayContent: string;
  intermediateOnly?: boolean;
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

function getMessageDisplayText(message: ChatMessage): string {
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
  if (rawText && parseInternalContext(rawText)) {
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
    });

    pendingNoctis = [];
  };

  messages.forEach((message) => {
    const isOutgoing = message.sender === "crystal";
    const canCollapseToIntermediate = message.sender === "noctis" && message.source === "session";

    if (isOutgoing) {
      flushPendingNoctis();
      rendered.push({
        ...message,
        displayContent: getMessageDisplayText(message),
      });
      return;
    }

    const displayContent = getMessageDisplayText(message);

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
    });

    pendingNoctis = [];
  });

  flushPendingNoctis();

  return rendered;
}

const MessageBubble = memo(({
  message,
  showCursor,
}: {
  message: RenderedChatMessage;
  showCursor: boolean;
}) => {
  const [copied, setCopied] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const isOutgoing = message.sender === "crystal";
  const isNoctis = message.sender === "noctis";
  const senderLabel = getActivityActorLabel(message.sender);
  const avatarSrc = getSenderAvatar(message.sender);
  const detailRawText = useMemo(
    () => pickDetailRawText(message),
    [message]
  );
  const internalContext = useMemo(() => parseInternalContext(detailRawText), [detailRawText]);
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
  const hasDetails = reasoning.trim().length > 0 || tools.length > 0 || internalContext !== null;
  const hasVisibleBody = message.displayContent.trim().length > 0 || showCursor;
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

  const handleCopy = () => {
    navigator.clipboard.writeText(copyContent).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className={cn(
        "group flex min-w-0 max-w-full items-end gap-2",
        isOutgoing ? "justify-end" : "justify-start"
      )}
    >
      {!isOutgoing && avatarSrc ? (
        <img
          alt={senderLabel}
          src={avatarSrc}
          className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-primary/30"
        />
      ) : null}
      <div
        className={cn(
          "flex min-w-0 max-w-[84%] flex-col",
          isOutgoing ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "mb-1 flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-widest",
            isOutgoing ? "text-primary/70" : "text-muted-foreground/65"
          )}
        >
          <span className="font-semibold">{senderLabel}</span>
          {message.timestamp.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </div>

        <div
          className={cn(
            "relative min-w-0 max-w-full overflow-x-hidden rounded-2xl border px-4 py-3 text-sm shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur-xs",
            isOutgoing
              ? "rounded-br-md border-primary/20 bg-primary/12 text-foreground"
              : isNoctis
                ? "rounded-bl-md border-border/40 bg-white/6 text-foreground"
                : "rounded-bl-md border-amber-300/15 bg-amber-50/8 text-foreground"
          )}
        >
          {hasVisibleBody ? (
            !isOutgoing ? (
              <div className="markdown-body text-[13px] leading-6 [&_li]:leading-6 [&_p]:leading-6 [&_pre]:text-[11px]">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                  {`${message.displayContent}${showCursor ? "▌" : ""}`}
                </ReactMarkdown>
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
                  <span className="text-[10px] text-muted-foreground/70">
                    {detailSummary}
                  </span>
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
            content={message.displayContent}
            rawTextContent={detailRawText}
            parts={message.parts}
            onOpenChange={setDetailOpen}
            open={detailOpen}
            sender={message.sender}
          />
        ) : null}
      </div>
    </div>
  );
});

MessageBubble.displayName = "MessageBubble";

export const ChatArea = ({
  messages,
  isResponding,
  isSessionActive = false,
  isStreaming = false,
  onAbort,
  onSend,
  showAbortAction = false,
}: ChatAreaProps) => {
  const renderedMessages = useMemo(() => buildRenderedMessages(messages), [messages]);

  return (
    <ChatThreadFrame
      header={
        <div className="flex shrink-0 items-center justify-between border-border/50 border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
              <img
                alt="FF15"
                className="h-5 w-5 object-contain"
                src="/favicons/favicon-32x32.png"
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
      }
      footer={
        <PromptComposer
          onSend={onSend}
          onAbort={onAbort}
          showAbortAction={showAbortAction}
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
              isStreaming &&
              message.sender === "noctis" &&
              index === renderedMessages.length - 1;
            return (
              <MessageBubble
                key={message.id}
                message={message}
                showCursor={isLastNoctis}
              />
            );
          })}

          {isSessionActive ? (
            <div className="flex items-end gap-2">
              <img
                alt="Noctis"
                src="/images/noctis.png"
                className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-primary/30"
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

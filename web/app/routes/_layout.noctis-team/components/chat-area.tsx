import {
  ArrowDown,
  ArrowUpRight,
  AtSign,
  BadgeInfo,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Folder,
  Radio,
  Send,
  Slash,
  Sparkles,
  Square,
  Wrench,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { PromptPart } from "@/lib/prompt-parts";
import { cn } from "@/lib/utils";
import type { MessagePart } from "@/routes/_layout.opencode.session.$id/types";
import { parseInternalContext, removeInternalContext } from "./internal-context";
import { buildMessageMarkdown, extractReasoning, extractText, extractTools } from "./message-parts";
import MessageDetailSheet from "./message-detail-sheet";

export interface ChatMessage {
  id: string;
  role: "noctis" | "user";
  content: string;
  parts?: MessagePart[];
  timestamp: Date;
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

interface MessageComposerProps {
  isResponding: boolean;
  onAbort?: () => void;
  onSend: (parts: PromptPart[]) => void | Promise<unknown>;
  showAbortAction?: boolean;
}

type SlashSuggestion = {
  description?: string;
  insertText: string;
  label: string;
  type: "command" | "skill";
  value: string;
};

type Suggestion = {
  description?: string;
  insertText?: string;
  label: string;
  type: "file" | "folder" | "command" | "skill";
  value: string;
};

type FindFileResult =
  | string
  | {
      description?: string;
      path: string;
      label?: string;
      isFolder?: boolean;
    };

const MAX_HEIGHT_PX = 160;

function findMentionQuery(value: string, cursor: number) {
  const prefix = value.slice(0, cursor);

  for (let index = prefix.length - 1; index >= 0; index -= 1) {
    const trigger = prefix[index];
    if (trigger !== "@" && trigger !== "/") {
      continue;
    }

    const previous = index === 0 ? "" : prefix[index - 1];
    if (previous && !/\s/.test(previous)) {
      continue;
    }

    const query = prefix.slice(index + 1);
    if (query.includes(" ") || query.includes("\n")) {
      return null;
    }

    return { trigger, query, start: index, end: cursor };
  }

  return null;
}

function removeMentionQuery(
  currentValue: string,
  mention: NonNullable<ReturnType<typeof findMentionQuery>>
) {
  const before = currentValue.slice(0, mention.start);
  const after = currentValue.slice(mention.end);

  if (/\s$/.test(before) && /^\s/.test(after)) {
    return `${before}${after.slice(1)}`;
  }

  if (before && after && !/\s$/.test(before) && !/^\s/.test(after)) {
    return `${before} ${after}`;
  }

  return `${before}${after}`;
}

function toMessageParts(message: ChatMessage): MessagePart[] {
  if (message.parts && message.parts.length > 0) {
    return message.parts;
  }

  if (!message.content) {
    return [];
  }

  return [{ type: "text", text: message.content } as MessagePart];
}

function getMessageRawText(message: ChatMessage): string {
  if (message.parts && message.parts.length > 0) {
    const extracted = extractText(message.parts);
    return extracted || message.content;
  }

  return message.content;
}

function getMessageDisplayText(message: ChatMessage): string {
  return removeInternalContext(getMessageRawText(message)).trim();
}

function buildRenderedMessages(messages: ChatMessage[]): RenderedChatMessage[] {
  const rendered: RenderedChatMessage[] = [];
  let pendingNoctis: ChatMessage[] = [];

  const flushPendingNoctis = () => {
    if (pendingNoctis.length === 0) {
      return;
    }

    const parts = pendingNoctis.flatMap((message) => toMessageParts(message));

    rendered.push({
      id: pendingNoctis.map((message) => message.id).join(":"),
      role: "noctis",
      content: "",
      parts: parts.length > 0 ? parts : undefined,
      timestamp: pendingNoctis[pendingNoctis.length - 1].timestamp,
      displayContent: "",
      intermediateOnly: true,
    });

    pendingNoctis = [];
  };

  messages.forEach((message) => {
    if (message.role === "user") {
      flushPendingNoctis();
      rendered.push({
        ...message,
        displayContent: getMessageDisplayText(message),
      });
      return;
    }

    const displayContent = getMessageDisplayText(message);

    if (!displayContent) {
      pendingNoctis.push(message);
      return;
    }

    const groupedMessages = [...pendingNoctis, message];
    const parts = groupedMessages.flatMap((entry) => toMessageParts(entry));

    rendered.push({
      ...message,
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
  const isNoctis = message.role === "noctis";
  const detailRawText = useMemo(
    () => {
      if (message.parts && message.parts.length > 0) {
        const extracted = extractText(message.parts);
        return extracted || message.content;
      }

      return message.content;
    },
    [message.content, message.parts]
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
        isNoctis ? "justify-start" : "justify-end"
      )}
    >
      {isNoctis && (
        <img
          alt="Noctis"
          src="/images/noctis.png"
          className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-primary/30"
        />
      )}
      <div
        className={cn(
          "flex min-w-0 max-w-[84%] flex-col",
          isNoctis ? "items-start" : "items-end"
        )}
      >
        <div
          className={cn(
            "mb-1 flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-widest",
            isNoctis ? "text-muted-foreground/65" : "text-primary/70"
          )}
        >
          <span className="font-semibold">{isNoctis ? "Noctis" : "You"}</span>
          {message.timestamp.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </div>

        <div
          className={cn(
            "relative min-w-0 max-w-full overflow-x-hidden rounded-2xl border px-4 py-3 text-sm shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur-xs",
            isNoctis
              ? "rounded-bl-md border-border/40 bg-white/6 text-foreground"
              : "rounded-br-md border-primary/20 bg-primary/12 text-foreground"
          )}
        >
          {hasVisibleBody ? (
            isNoctis ? (
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
            parts={message.parts}
            onOpenChange={setDetailOpen}
            open={detailOpen}
            role={message.role}
          />
        ) : null}
      </div>
    </div>
  );
});

MessageBubble.displayName = "MessageBubble";

const MessageComposer = memo(({
  isResponding,
  onAbort,
  onSend,
  showAbortAction = false,
}: MessageComposerProps) => {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [slashSuggestions, setSlashSuggestions] = useState<SlashSuggestion[]>([]);
  const [fileMentions, setFileMentions] = useState<string[]>([]);
  const [slashMentions, setSlashMentions] = useState<SlashSuggestion[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionRequestIdRef = useRef(0);

  useEffect(() => {
    const loadSlashSuggestions = async () => {
      const response = await fetch("/api/slash-suggestions").catch(() => null);
      if (!response?.ok) {
        return;
      }

      const data = (await response.json()) as { suggestions: SlashSuggestion[] };
      setSlashSuggestions(data.suggestions ?? []);
    };

    void loadSlashSuggestions();
  }, []);

  useEffect(() => {
    setSelectedSuggestionIndex(0);
  }, [suggestions]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT_PX);
    textarea.style.height = `${Math.max(nextHeight, 40)}px`;
    textarea.style.overflowY = textarea.scrollHeight > MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [input]);

  const updateSuggestions = useCallback(async () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const cursor = textarea.selectionStart ?? input.length;
    const mention = findMentionQuery(input, cursor);
    const requestId = suggestionRequestIdRef.current + 1;
    suggestionRequestIdRef.current = requestId;

    if (!mention) {
      setIsOpen(false);
      setSuggestions([]);
      return;
    }

    if (mention.trigger === "@") {
      const params = new URLSearchParams({ q: mention.query });
      const response = await fetch(`/api/find-files?${params.toString()}`).catch(() => null);

      if (requestId !== suggestionRequestIdRef.current) {
        return;
      }

      const data = response?.ok
        ? ((await response.json()) as { files: FindFileResult[] })
        : { files: [] };
      const selectedFiles = new Set(fileMentions);
      const fileSuggestions = (data.files ?? [])
        .map((item) => {
          if (typeof item === "string") {
            return {
              label: item,
              value: item,
              type: "file" as const,
            };
          }

          return {
            description: item.description,
            label: item.label ?? item.path,
            value: item.path,
            type: item.isFolder ? ("folder" as const) : ("file" as const),
          };
        })
        .filter((item) => !selectedFiles.has(item.value));

      setSuggestions(fileSuggestions);
      setIsOpen(fileSuggestions.length > 0);
      return;
    }

    const keyword = mention.query.toLowerCase();
    const selectedSlash = new Set(slashMentions.map((item) => `${item.type}:${item.value}`));
    const filtered = slashSuggestions
      .filter(
        (item) =>
          item.label.toLowerCase().includes(keyword) || item.value.toLowerCase().includes(keyword)
      )
      .filter((item) => !selectedSlash.has(`${item.type}:${item.value}`))
      .map((item) => ({
        label: item.label,
        value: item.value,
        type: item.type,
        description: item.description,
        insertText: item.insertText,
      }));

    setSuggestions(filtered);
    setIsOpen(filtered.length > 0);
  }, [fileMentions, input, slashMentions, slashSuggestions]);

  useEffect(() => {
    void updateSuggestions();
  }, [updateSuggestions]);

  const handleSelectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      const cursor = textarea.selectionStart ?? input.length;
      const mention = findMentionQuery(input, cursor);
      if (!mention) {
        return;
      }

      if (suggestion.type === "file" || suggestion.type === "folder") {
        setFileMentions((current) =>
          current.includes(suggestion.value) ? current : [...current, suggestion.value]
        );
      }

      if (suggestion.type === "command" || suggestion.type === "skill") {
        const selected = slashSuggestions.find(
          (item) => item.type === suggestion.type && item.value === suggestion.value
        );

        if (selected) {
          setSlashMentions((current) =>
            current.some((item) => item.type === selected.type && item.value === selected.value)
              ? current
              : [...current, selected]
          );
        }
      }

      const nextValue = removeMentionQuery(input, mention);
      setInput(nextValue);
      setIsOpen(false);
      setSuggestions([]);
      requestAnimationFrame(() => {
        const nextPos = Math.min(mention.start, nextValue.length);
        textarea.setSelectionRange(nextPos, nextPos);
        textarea.focus();
      });
    },
    [input, slashSuggestions]
  );

  const parseParts = useCallback((): PromptPart[] => {
    const parts: PromptPart[] = fileMentions.map((path) => ({ type: "file", path }));
    const slashText = slashMentions.map((item) => item.insertText).join("");
    const text = input.trim();
    const combinedText = `${slashText}${text}`.trim();

    if (combinedText) {
      parts.push({ type: "text", text: combinedText });
    }

    return parts;
  }, [fileMentions, input, slashMentions]);

  const canSubmit = input.trim().length > 0 || fileMentions.length > 0 || slashMentions.length > 0;

  const handleSend = useCallback(() => {
    if (!canSubmit || isResponding) {
      return;
    }

    onSend(parseParts());
    setInput("");
    setFileMentions([]);
    setSlashMentions([]);
    setIsOpen(false);
    setSuggestions([]);

    if (textareaRef.current) {
      textareaRef.current.style.height = "40px";
      textareaRef.current.style.overflowY = "hidden";
      textareaRef.current.focus();
    }
  }, [canSubmit, isResponding, onSend, parseParts]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isOpen && suggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedSuggestionIndex((current) => (current + 1) % suggestions.length);
          return;
        }

        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedSuggestionIndex(
            (current) => (current - 1 + suggestions.length) % suggestions.length
          );
          return;
        }

        if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
          e.preventDefault();
          handleSelectSuggestion(suggestions[selectedSuggestionIndex]);
          return;
        }

        if (e.key === "Escape") {
          e.preventDefault();
          setIsOpen(false);
          setSuggestions([]);
          return;
        }
      }

      if (
        e.key === "Backspace" &&
        !input &&
        (e.currentTarget.selectionStart ?? 0) === 0 &&
        (e.currentTarget.selectionEnd ?? 0) === 0
      ) {
        if (fileMentions.length > 0) {
          e.preventDefault();
          setFileMentions((current) => current.slice(0, -1));
          return;
        }

        if (slashMentions.length > 0) {
          e.preventDefault();
          setSlashMentions((current) => current.slice(0, -1));
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [
      fileMentions.length,
      handleSelectSuggestion,
      handleSend,
      input,
      isOpen,
      selectedSuggestionIndex,
      slashMentions.length,
      suggestions,
    ]
  );

  const triggerIcon = useMemo(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return null;
    }

    const mention = findMentionQuery(input, textarea.selectionStart ?? input.length);
    if (!mention) {
      return null;
    }

    if (mention.trigger === "@") {
      return <AtSign className="h-4 w-4" />;
    }

    if (mention.trigger === "/") {
      return <Slash className="h-4 w-4" />;
    }

    return null;
  }, [input]);

  return (
    <div className="shrink-0 border-border/50 border-t px-4 py-4">
      <div className="mx-auto max-w-3xl rounded-xl border border-transparent bg-card shadow-xs">
        <Popover open={isOpen && suggestions.length > 0} onOpenChange={setIsOpen}>
          <PopoverAnchor asChild>
            <div className="px-3 pt-3">
              {(fileMentions.length > 0 || slashMentions.length > 0) && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {slashMentions.map((item) => (
                    <span
                      key={`${item.type}:${item.value}`}
                      className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 bg-muted/60 px-2.5 py-1 text-xs text-foreground"
                    >
                      <Sparkles className="h-3 w-3 shrink-0" />
                      <span className="truncate">{item.label}</span>
                      <button
                        type="button"
                        className="rounded-full p-0.5 text-muted-foreground transition hover:bg-background hover:text-foreground"
                        onClick={() =>
                          setSlashMentions((current) =>
                            current.filter(
                              (currentItem) =>
                                !(currentItem.type === item.type && currentItem.value === item.value)
                            )
                          )
                        }
                        aria-label={`Remove ${item.type} ${item.label}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}

                  {fileMentions.map((path) => (
                    <span
                      key={path}
                      className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 bg-muted/60 px-2.5 py-1 text-xs text-foreground"
                    >
                      <FileText className="h-3 w-3 shrink-0" />
                      <span className="truncate">{path}</span>
                      <button
                        type="button"
                        className="rounded-full p-0.5 text-muted-foreground transition hover:bg-background hover:text-foreground"
                        onClick={() =>
                          setFileMentions((current) => current.filter((item) => item !== path))
                        }
                        aria-label={`Remove file ${path}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <Textarea
                ref={textareaRef}
                className={cn(
                  "min-h-10 w-full resize-none rounded-xl border border-transparent bg-transparent px-3 py-2 text-sm leading-relaxed text-foreground",
                  "shadow-none outline-hidden",
                  "placeholder:text-muted-foreground/65",
                  "focus-visible:ring-0 focus-visible:ring-offset-0",
                  "disabled:opacity-60"
                )}
                disabled={isResponding && !showAbortAction}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Send a message to Noctis... Use @ for files/folders and / for commands/skills. Shift+Enter for new line"
                rows={1}
                value={input}
              />
            </div>
          </PopoverAnchor>

          <PopoverContent
            align="start"
            className="w-80"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
            }}
          >
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              {triggerIcon}
              Suggestions
            </div>

            <div className="max-h-64 space-y-1 overflow-auto">
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.type}-${suggestion.value}`}
                  type="button"
                  tabIndex={-1}
                  className={cn(
                    "flex w-full items-start justify-between rounded-md px-2 py-1.5 text-left text-sm",
                    index === selectedSuggestionIndex ? "bg-accent" : "hover:bg-accent"
                  )}
                  onMouseEnter={() => setSelectedSuggestionIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleSelectSuggestion(suggestion);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{suggestion.label}</span>
                    {suggestion.description ? (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {suggestion.description}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    {suggestion.type === "folder" ? (
                      <Folder className="h-3 w-3" />
                    ) : suggestion.type === "file" ? (
                      <FileText className="h-3 w-3" />
                    ) : suggestion.type === "skill" ? (
                      <Sparkles className="h-3 w-3" />
                    ) : suggestion.type === "command" ? (
                      <Slash className="h-3 w-3" />
                    ) : null}
                    {suggestion.type}
                  </span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-2 px-3 pb-3 pt-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/45">
            Enter sends · Shift+Enter adds a new line · @ files · / skills
          </p>
          <button
            type="button"
            onClick={showAbortAction ? onAbort : handleSend}
            disabled={showAbortAction ? !onAbort : !canSubmit || isResponding}
            title={showAbortAction ? "Stop" : "Send"}
            className={cn(
              "ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all",
              showAbortAction
                ? "border-red-500/25 bg-red-500/15 text-red-50 hover:border-red-400/35 hover:bg-red-500/20"
                : !canSubmit || isResponding
                  ? "cursor-not-allowed border-border/40 bg-background/45 text-muted-foreground/35"
                  : "border-primary/25 bg-primary/12 text-foreground hover:border-primary/40 hover:bg-primary/18"
            )}
          >
            {showAbortAction ? <Square className="h-3.5 w-3.5" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
});

MessageComposer.displayName = "MessageComposer";

export const ChatArea = ({
  messages,
  isResponding,
  isSessionActive = false,
  isStreaming = false,
  onAbort,
  onSend,
  showAbortAction = false,
}: ChatAreaProps) => {
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const renderedMessages = useMemo(() => buildRenderedMessages(messages), [messages]);

  const syncScrollState = useCallback(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) {
      return;
    }

    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const nearBottom = distanceFromBottom < 72;

    shouldStickToBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = scrollViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    if (shouldStickToBottomRef.current) {
      window.setTimeout(() => scrollToBottom(renderedMessages.length > 1 ? "smooth" : "auto"), 0);
    }
  }, [renderedMessages, scrollToBottom]);

  useEffect(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) {
      return;
    }

    syncScrollState();

    const handleScroll = () => {
      syncScrollState();
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
    };
  }, [syncScrollState]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
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
              Noctis Lucis Caelum — Direct Line
            </p>
          </div>
        </div>

        {isSessionActive && (
          <div className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1">
            <Radio
              className="h-3 w-3 text-primary"
              style={{ animation: "agent-glow 1s ease-in-out infinite" }}
            />
            <span className="animate-pulse font-mono text-[9px] font-semibold uppercase tracking-widest text-primary">
              Radio Incoming
            </span>
          </div>
        )}
      </div>

      <div className="relative min-h-0 min-w-0 flex-1">
        <ScrollArea
          className="h-full min-w-0 px-4 py-4"
          viewportClassName="[&>div]:!block [&>div]:!w-full"
          viewportRef={scrollViewportRef}
        >
          <div className="mx-auto w-full min-w-0 max-w-3xl space-y-5 overflow-x-hidden">
          {renderedMessages.map((message, index) => {
            const isLastNoctis =
              isStreaming &&
              message.role === "noctis" &&
              index === renderedMessages.length - 1;
            return (
              <MessageBubble
                key={message.id}
                message={message}
                showCursor={isLastNoctis}
              />
            );
          })}

          {isSessionActive && (
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
          )}

          </div>
        </ScrollArea>

        {showScrollToBottom ? (
          <Button
            aria-label="Scroll to latest message"
            className="absolute right-8 bottom-6 h-10 w-10 rounded-full border border-white/10 bg-slate-950/90 p-0 text-slate-100 shadow-lg backdrop-blur hover:bg-slate-900"
            onClick={() => scrollToBottom()}
            size="sm"
            title="Scroll to latest message"
            type="button"
            variant="outline"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <MessageComposer
        isResponding={isResponding}
        onAbort={onAbort}
        onSend={onSend}
        showAbortAction={showAbortAction}
      />
    </div>
  );
};

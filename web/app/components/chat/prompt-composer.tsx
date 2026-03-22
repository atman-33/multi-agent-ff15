import { AtSign, FileText, Folder, Send, Slash, Sparkles, Square, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import type { PromptPart } from "@/lib/prompt-parts";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";

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

type PromptComposerProps = {
  draftKey?: string;
  onSend: (parts: PromptPart[], options?: { agent?: string | null }) => void | Promise<unknown>;
  getSendOptions?: () => { agent?: string | null } | undefined;
  onAbort?: () => void;
  disabled?: boolean;
  showAbortAction?: boolean;
  showAbortActionWhenComposing?: boolean;
  isAborting?: boolean;
  placeholder?: string;
  helperText?: ReactNode;
  footerStart?: ReactNode;
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

export function PromptComposer({
  draftKey,
  onSend,
  getSendOptions,
  onAbort,
  disabled = false,
  showAbortAction = false,
  showAbortActionWhenComposing = true,
  isAborting = false,
  placeholder,
  helperText,
  footerStart,
}: PromptComposerProps) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [slashSuggestions, setSlashSuggestions] = useState<SlashSuggestion[]>([]);
  const [fileMentions, setFileMentions] = useState<string[]>([]);
  const [slashMentions, setSlashMentions] = useState<SlashSuggestion[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionRequestIdRef = useRef(0);

  const sessionDrafts = useChatStore((state) => state.sessionDrafts);
  const setSessionDraft = useChatStore((state) => state.setSessionDraft);
  const clearSessionDraft = useChatStore((state) => state.clearSessionDraft);

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
    if (!draftKey) {
      setInput("");
      setFileMentions([]);
      setSlashMentions([]);
      return;
    }

    const draft = sessionDrafts[draftKey];
    setInput(draft?.value ?? "");
    setFileMentions(draft?.fileMentions ?? []);
    setSlashMentions(draft?.slashMentions ?? []);
    setSuggestions([]);
    setIsOpen(false);
    setSelectedSuggestionIndex(0);
  }, [draftKey, sessionDrafts]);

  useEffect(() => {
    if (!draftKey) {
      return;
    }

    if (!input && fileMentions.length === 0 && slashMentions.length === 0) {
      clearSessionDraft(draftKey);
      return;
    }

    setSessionDraft(draftKey, {
      value: input,
      fileMentions,
      slashMentions,
    });
  }, [clearSessionDraft, draftKey, fileMentions, input, setSessionDraft, slashMentions]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || textarea.value !== input) {
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
      setSelectedSuggestionIndex(0);
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
      setSelectedSuggestionIndex(0);
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
    setSelectedSuggestionIndex(0);
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
  const effectiveShowAbortAction = showAbortAction && (showAbortActionWhenComposing || !canSubmit);

  const handleSubmit = useCallback(() => {
    if (!canSubmit || disabled) {
      return;
    }

    try {
      const parts = parseParts();
      void Promise.resolve(onSend(parts, getSendOptions?.())).catch(() => {
        toast.error("Unable to send message");
      });
      setInput("");
      setFileMentions([]);
      setSlashMentions([]);
      setIsOpen(false);
      setSuggestions([]);

      if (draftKey) {
        clearSessionDraft(draftKey);
      }

      if (textareaRef.current) {
        textareaRef.current.style.height = "40px";
        textareaRef.current.style.overflowY = "hidden";
        textareaRef.current.focus();
      }
    } catch {
      toast.error("Unable to prepare message");
    }
  }, [canSubmit, clearSessionDraft, disabled, draftKey, getSendOptions, onSend, parseParts]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isOpen && suggestions.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedSuggestionIndex((current) => (current + 1) % suggestions.length);
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedSuggestionIndex(
            (current) => (current - 1 + suggestions.length) % suggestions.length
          );
          return;
        }

        if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
          event.preventDefault();
          handleSelectSuggestion(suggestions[selectedSuggestionIndex]);
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          setIsOpen(false);
          setSuggestions([]);
          return;
        }
      }

      if (
        event.key === "Backspace" &&
        !input &&
        (event.currentTarget.selectionStart ?? 0) === 0 &&
        (event.currentTarget.selectionEnd ?? 0) === 0
      ) {
        if (fileMentions.length > 0) {
          event.preventDefault();
          setFileMentions((current) => current.slice(0, -1));
          return;
        }

        if (slashMentions.length > 0) {
          event.preventDefault();
          setSlashMentions((current) => current.slice(0, -1));
          return;
        }
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSubmit();
      }
    },
    [
      fileMentions.length,
      handleSelectSuggestion,
      handleSubmit,
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
                                !(
                                  currentItem.type === item.type && currentItem.value === item.value
                                )
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
                disabled={disabled}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  placeholder ??
                  "Send a message... Use @ for files/folders and / for commands/skills. Shift+Enter for new line"
                }
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

        <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-2">
          {footerStart}
          {helperText ? (
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/45">
              {helperText}
            </p>
          ) : null}
          <button
            type="button"
            onClick={effectiveShowAbortAction ? onAbort : handleSubmit}
            disabled={
              effectiveShowAbortAction ? !onAbort || disabled || isAborting : !canSubmit || disabled
            }
            title={effectiveShowAbortAction ? "Stop" : "Send"}
            className={cn(
              "ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all",
              effectiveShowAbortAction
                ? "border-red-500/25 bg-red-500/15 text-red-50 hover:border-red-400/35 hover:bg-red-500/20"
                : !canSubmit || disabled
                  ? "cursor-not-allowed border-border/40 bg-background/45 text-muted-foreground/35"
                  : "border-primary/25 bg-primary/12 text-foreground hover:border-primary/40 hover:bg-primary/18"
            )}
          >
            {effectiveShowAbortAction ? (
              <Square className={cn("h-3.5 w-3.5", isAborting && "animate-pulse")} />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

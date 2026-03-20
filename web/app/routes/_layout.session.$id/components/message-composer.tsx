import { ArrowUp, AtSign, Bot, CheckCircle2, ChevronDown, FileText, Folder, Slash, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";

type Agent = {
  name: string;
  description?: string;
};

type SlashSuggestion = {
  description?: string;
  insertText: string;
  label: string;
  type: "command" | "skill";
  value: string;
};

type Provider = {
  id: string;
  name: string;
  models: Record<string, { id: string; name: string }>;
};

type ProvidersResponse = {
  providers: Provider[];
  default: Record<string, string>;
};

type Props = {
  onSend: (
    parts: Array<{ type: "text"; text: string } | { type: "file"; path: string; content?: string }>,
    options?: { agent?: string | null }
  ) => void;
  disabled?: boolean;
};

type Suggestion = {
  label: string;
  value: string;
  type: "file" | "folder" | "command" | "skill";
  description?: string;
  insertText?: string;
};

type FindFileResult =
  | string
  | {
      path: string;
      label?: string;
      isFolder?: boolean;
    };

  const MIN_ROWS = 2;
  const MAX_HEIGHT_PX = 160;

const findMentionQuery = (value: string, cursor: number) => {
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
};

const removeMentionQuery = (
  currentValue: string,
  mention: NonNullable<ReturnType<typeof findMentionQuery>>
) => {
  const before = currentValue.slice(0, mention.start);
  const after = currentValue.slice(mention.end);

  if (/\s$/.test(before) && /^\s/.test(after)) {
    return `${before}${after.slice(1)}`;
  }

  if (before && after && !/\s$/.test(before) && !/^\s/.test(after)) {
    return `${before} ${after}`;
  }

  return `${before}${after}`;
};

const MessageComposer = ({ onSend, disabled }: Props) => {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [slashSuggestions, setSlashSuggestions] = useState<SlashSuggestion[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [fileMentions, setFileMentions] = useState<string[]>([]);
  const [slashMentions, setSlashMentions] = useState<SlashSuggestion[]>([]);
  const [arrowState, setArrowState] = useState<"idle" | "flying" | "done">("idle");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionRequestIdRef = useRef(0);
  const arrowTimeoutsRef = useRef<number[]>([]);

  const selectedModel = useChatStore((state) => state.selectedModel);
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);
  const selectedAgent = useChatStore((state) => state.selectedAgent);
  const setSelectedAgent = useChatStore((state) => state.setSelectedAgent);

  useEffect(() => {
    const loadAgents = async () => {
      const response = await fetch("/api/agents").catch(() => null);
      if (!response?.ok) return;
      const data = (await response.json()) as { agents: Agent[] };
      setAgents(data.agents ?? []);
    };

    const loadSlashSuggestions = async () => {
      const response = await fetch("/api/slash-suggestions").catch(() => null);
      if (!response?.ok) return;
      const data = (await response.json()) as { suggestions: SlashSuggestion[] };
      setSlashSuggestions(data.suggestions ?? []);
    };

    const loadProviders = async () => {
      const response = await fetch("/api/providers").catch(() => null);
      if (!response?.ok) return;
      const data = (await response.json()) as ProvidersResponse;
      setProviders(data.providers ?? []);
      const currentModel = useChatStore.getState().selectedModel;
      if (!currentModel && data.providers?.length) {
        const provider = data.providers[0];
        const firstModel = Object.values(provider.models ?? {})[0];
        if (provider && firstModel) {
          useChatStore
            .getState()
            .setSelectedModel({ providerID: provider.id, modelID: firstModel.id });
        }
      }
    };

    loadAgents();
    loadSlashSuggestions();
    loadProviders();
  }, []);

  useEffect(() => {
    setSelectedSuggestionIndex(0);
  }, [suggestions]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(scrollHeight, MAX_HEIGHT_PX)}px`;
    textarea.style.overflowY = scrollHeight > MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [value]);

  useEffect(() => {
    return () => {
      for (const timeoutId of arrowTimeoutsRef.current) {
        window.clearTimeout(timeoutId);
      }
      arrowTimeoutsRef.current = [];
    };
  }, []);

  const modelItems = useMemo(() => {
    return providers.flatMap((provider) =>
      Object.values(provider.models ?? {}).map((model) => ({
        providerID: provider.id,
        providerName: provider.name,
        modelID: model.id,
        modelName: model.name,
      }))
    );
  }, [providers]);

  const currentModelLabel = useMemo(() => {
    const current = modelItems.find(
      (item) =>
        item.providerID === selectedModel?.providerID && item.modelID === selectedModel?.modelID
    );
    if (current) return `${current.providerName} / ${current.modelName}`;
    return "Model";
  }, [modelItems, selectedModel]);

  const updateSuggestions = useCallback(async () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursor = textarea.selectionStart ?? value.length;
    const mention = findMentionQuery(value, cursor);
    const requestId = suggestionRequestIdRef.current + 1;
    suggestionRequestIdRef.current = requestId;

    if (!mention) {
      setIsOpen(false);
      setSuggestions([]);
      return;
    }

    if (mention.trigger === "@") {
      const response = await fetch(`/api/find-files?q=${encodeURIComponent(mention.query)}`).catch(
        () => null
      );

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

          const value = item.path;
          return {
            label: item.label ?? item.path,
            value,
            type: item.isFolder ? ("folder" as const) : ("file" as const),
          };
        })
        .filter((item) => !selectedFiles.has(item.value));

      setSuggestions(fileSuggestions);
      setIsOpen(fileSuggestions.length > 0);
      return;
    }

    if (mention.trigger === "/") {
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
    }
  }, [fileMentions, slashMentions, slashSuggestions, value]);

  useEffect(() => {
    void updateSuggestions();
  }, [updateSuggestions]);

  const handleSelectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursor = textarea.selectionStart ?? value.length;
      const mention = findMentionQuery(value, cursor);
      if (!mention) return;

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

      const nextValue = removeMentionQuery(value, mention);
      setValue(nextValue);
      setIsOpen(false);
      setSuggestions([]);
      requestAnimationFrame(() => {
        const nextPos = Math.min(mention.start, nextValue.length);
        textarea.setSelectionRange(nextPos, nextPos);
        textarea.focus();
      });
    },
    [slashSuggestions, value]
  );

  const parseParts = useCallback(() => {
    const slashText = slashMentions.map((item) => item.insertText).join("");
    const parts: Array<
      { type: "text"; text: string } | { type: "file"; path: string; content?: string }
    > = fileMentions.map((path) => ({ type: "file" as const, path }));
    const text = value.trim();
    const combinedText = `${slashText}${text}`.trim();

    if (combinedText) {
      parts.push({ type: "text" as const, text: combinedText });
    }

    return parts;
  }, [fileMentions, slashMentions, value]);

  const canSubmit = value.trim().length > 0 || fileMentions.length > 0 || slashMentions.length > 0;

  const triggerSendAnimation = useCallback(() => {
    for (const timeoutId of arrowTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    arrowTimeoutsRef.current = [];

    setArrowState("flying");

    arrowTimeoutsRef.current.push(
      window.setTimeout(() => {
        setArrowState("done");
      }, 300)
    );

    arrowTimeoutsRef.current.push(
      window.setTimeout(() => {
        setArrowState("idle");
      }, 1500)
    );
  }, []);

  const handleSubmit = useCallback(() => {
    if (!canSubmit || disabled) return;

    try {
      const parts = parseParts();
      triggerSendAnimation();
      onSend(parts, { agent: selectedAgent });
      setValue("");
      setFileMentions([]);
      setSlashMentions([]);
    } catch {
      setArrowState("idle");
      toast.error("Unable to prepare message");
    }
  }, [canSubmit, disabled, onSend, parseParts, selectedAgent, triggerSendAnimation]);

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
        !value &&
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
      isOpen,
      selectedSuggestionIndex,
      slashMentions.length,
      suggestions,
      value,
    ]
  );

  const triggerIcon = useMemo(() => {
    const textarea = textareaRef.current;
    if (!textarea) return null;

    const mention = findMentionQuery(value, textarea.selectionStart ?? value.length);
    if (!mention) return null;
    if (mention.trigger === "@") return <AtSign className="h-4 w-4" />;
    if (mention.trigger === "/") return <Slash className="h-4 w-4" />;
    return null;
  }, [value]);

  return (
    <div className="rounded-xl border border-transparent bg-card shadow-sm">
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

            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Send a message... Use @ for files/folders and / for commands/skills. Shift+Enter for new line"
                disabled={disabled}
                rows={MIN_ROWS}
                className={cn(
                  "w-full resize-none rounded-xl border border-border/40 bg-background/60 py-2 pl-3 pr-12 text-xs leading-relaxed",
                  "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm",
                  "focus:outline-none focus:ring-1 focus:ring-ring",
                  "placeholder:text-muted-foreground/40"
                )}
              />

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || disabled}
                title="Send"
                className={cn(
                  "absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full border backdrop-blur-md transition-all duration-200 ease-out",
                  !canSubmit || disabled
                    ? "cursor-not-allowed border-border/40 bg-background/45 text-muted-foreground/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : arrowState === "done"
                      ? "border-emerald-400/30 bg-emerald-500/14 text-emerald-50 shadow-[0_10px_24px_rgba(6,78,59,0.28),inset_0_1px_0_rgba(255,255,255,0.08)]"
                      : "border-indigo-400/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(99,102,241,0.14))] text-slate-100 shadow-[0_10px_28px_rgba(2,6,23,0.38),0_0_0_1px_rgba(99,102,241,0.06),inset_0_1px_0_rgba(255,255,255,0.12)] hover:border-indigo-300/35 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(129,140,248,0.2))] hover:text-white hover:shadow-[0_14px_32px_rgba(2,6,23,0.45),0_0_18px_rgba(99,102,241,0.12),inset_0_1px_0_rgba(255,255,255,0.16)] active:translate-y-[1px]"
                )}
              >
                {arrowState === "done" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <div className="relative flex h-3.5 w-3.5 items-center justify-center overflow-hidden">
                    <ArrowUp
                      className={cn(
                        "absolute h-3.5 w-3.5 transition-all duration-300",
                        arrowState === "flying" ? "-translate-y-6 opacity-0" : "translate-y-0 opacity-100"
                      )}
                    />
                    <ArrowUp
                      className={cn(
                        "absolute h-3.5 w-3.5 transition-all duration-300",
                        arrowState === "flying" ? "-translate-y-3 opacity-100" : "translate-y-3 opacity-0"
                      )}
                    />
                  </div>
                )}
              </button>
            </div>
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
                  {suggestion.description && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {suggestion.description}
                    </span>
                  )}
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

      <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-2">
        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              >
                <Bot className="h-3.5 w-3.5" />
                {selectedAgent ?? "Agent"}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start" className="max-h-60 overflow-auto">
              <DropdownMenuLabel>Agents</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSelectedAgent(null)}>
                <span className={cn(!selectedAgent && "font-medium text-primary")}>Default</span>
              </DropdownMenuItem>
              {agents.map((agent) => (
                <DropdownMenuItem key={agent.name} onClick={() => setSelectedAgent(agent.name)}>
                  <div>
                    <div
                      className={cn(
                        "text-sm",
                        selectedAgent === agent.name && "font-medium text-primary"
                      )}
                    >
                      {agent.name}
                    </div>
                    {agent.description && (
                      <div className="text-[10px] text-muted-foreground">{agent.description}</div>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 max-w-[200px] gap-1 px-2 text-xs text-muted-foreground"
              >
                <span className="truncate">{currentModelLabel}</span>
                <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start" className="max-h-72 overflow-auto">
              <DropdownMenuLabel>Models</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {modelItems.map((item) => (
                <DropdownMenuItem
                  key={`${item.providerID}-${item.modelID}`}
                  onClick={() =>
                    setSelectedModel({ providerID: item.providerID, modelID: item.modelID })
                  }
                >
                  <span
                    className={cn(
                      selectedModel?.providerID === item.providerID &&
                        selectedModel?.modelID === item.modelID
                        ? "font-medium text-primary"
                        : ""
                    )}
                  >
                    {item.providerName} / {item.modelName}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

      </div>
    </div>
  );
};

export default MessageComposer;

import { ArrowUp, AtSign, Bot, ChevronDown, Slash } from "lucide-react";
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

type Command = {
  name: string;
  description?: string;
  template: string;
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
  type: "file" | "agent" | "command";
};

const findMentionQuery = (value: string, cursor: number) => {
  const prefix = value.slice(0, cursor);
  const atIndex = prefix.lastIndexOf("@");
  const slashIndex = prefix.lastIndexOf("/");
  const lastTrigger = Math.max(atIndex, slashIndex);
  if (lastTrigger === -1) return null;
  const trigger = prefix[lastTrigger];
  const query = prefix.slice(lastTrigger + 1);
  if (query.includes(" ") || query.includes("\n")) return null;
  return { trigger, query, start: lastTrigger, end: cursor };
};

const MessageComposer = ({ onSend, disabled }: Props) => {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const agentNames = useMemo(
    () => new Set(agents.map((agent) => agent.name.toLowerCase())),
    [agents]
  );

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
    const loadCommands = async () => {
      const response = await fetch("/api/commands").catch(() => null);
      if (!response?.ok) return;
      const data = (await response.json()) as { commands: Command[] };
      setCommands(data.commands ?? []);
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
    loadCommands();
    loadProviders();
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
        item.providerID === selectedModel?.providerID && item.modelID === selectedModel.modelID
    );
    if (current) return `${current.providerName} / ${current.modelName}`;
    return "Model";
  }, [modelItems, selectedModel]);

  const updateSuggestions = useCallback(async () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart ?? value.length;
    const mention = findMentionQuery(value, cursor);
    if (!mention) {
      setIsOpen(false);
      setSuggestions([]);
      return;
    }

    if (mention.trigger === "@") {
      const response = await fetch(`/api/find-files?q=${encodeURIComponent(mention.query)}`).catch(
        () => null
      );
      if (!response?.ok) {
        setSuggestions([]);
        return;
      }
      const data = (await response.json()) as { files: string[] };
      const fileSuggestions = (data.files ?? []).map((file) => ({
        label: file,
        value: file,
        type: "file" as const,
      }));
      const agentSuggestions = agents
        .filter((agent) => agent.name.toLowerCase().includes(mention.query.toLowerCase()))
        .map((agent) => ({
          label: agent.name,
          value: agent.name,
          type: "agent" as const,
        }));
      setSuggestions([...fileSuggestions, ...agentSuggestions]);
      setIsOpen(true);
      return;
    }

    if (mention.trigger === "/") {
      const filtered = commands
        .filter((command) => command.name.toLowerCase().includes(mention.query.toLowerCase()))
        .map((command) => ({
          label: command.name,
          value: command.name,
          type: "command" as const,
        }));
      setSuggestions(filtered);
      setIsOpen(true);
    }
  }, [agents, commands, value]);

  useEffect(() => {
    updateSuggestions();
  }, [updateSuggestions]);

  const handleSelectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const cursor = textarea.selectionStart ?? value.length;
      const mention = findMentionQuery(value, cursor);
      if (!mention) return;
      const insert = `${mention.trigger}${suggestion.value}`;
      const nextValue = `${value.slice(0, mention.start)}${insert} ${value.slice(mention.end)}`;
      setValue(nextValue);
      setIsOpen(false);
      setSuggestions([]);
      requestAnimationFrame(() => {
        const nextPos = mention.start + insert.length + 1;
        textarea.setSelectionRange(nextPos, nextPos);
        textarea.focus();
      });
    },
    [value]
  );

  const parseParts = useCallback(() => {
    const matches = Array.from(value.matchAll(/@([\w./-]+)/g));
    if (!matches.length) {
      return [{ type: "text" as const, text: value.trim() }];
    }
    const parts: Array<
      { type: "text"; text: string } | { type: "file"; path: string; content?: string }
    > = [];
    let cursor = 0;
    for (const match of matches) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const filePath = match[1];
      if (start > cursor) {
        parts.push({ type: "text" as const, text: value.slice(cursor, start) });
      }
      if (agentNames.has(filePath.toLowerCase())) {
        parts.push({ type: "text" as const, text: value.slice(start, end) });
      } else {
        parts.push({ type: "file" as const, path: filePath });
      }
      cursor = end;
    }
    if (cursor < value.length) {
      parts.push({ type: "text" as const, text: value.slice(cursor) });
    }
    return parts.filter((part) => (part.type === "text" ? part.text.trim().length > 0 : true));
  }, [agentNames, value]);

  const handleSubmit = useCallback(() => {
    if (!value.trim() || disabled) return;
    try {
      const parts = parseParts();
      onSend(parts, { agent: selectedAgent });
      setValue("");
    } catch {
      toast.error("Unable to prepare message");
    }
  }, [disabled, onSend, parseParts, selectedAgent, value]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
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
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message... (Shift+Enter for new line)"
              disabled={disabled}
              rows={1}
              className={cn(
                "min-h-[36px] max-h-48 w-full resize-none border-0 border-transparent bg-transparent p-0 shadow-none outline-none ring-0",
                "focus:border-transparent focus:outline-none focus:ring-0 focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-muted-foreground/60"
              )}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent align="start" className="w-80">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            {triggerIcon}
            Suggestions
          </div>
          <div className="max-h-64 space-y-1 overflow-auto">
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.type}-${suggestion.value}`}
                type="button"
                className="flex w-full items-start justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => handleSelectSuggestion(suggestion)}
              >
                <span className="font-medium">{suggestion.label}</span>
                <span className="text-[10px] text-muted-foreground">{suggestion.type}</span>
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

        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={!value.trim() || disabled}
          className="h-8 w-8 shrink-0 rounded-lg"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default MessageComposer;

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ArrowUp, AtSign, Slash } from "lucide-react";
import { toast } from "sonner";

type Agent = {
  name: string;
  description?: string;
};

type Command = {
  name: string;
  description?: string;
  template: string;
};

type Props = {
  onSend: (parts: Array<{ type: "text"; text: string } | { type: "file"; path: string; content?: string }>) => void;
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const agentNames = useMemo(() => new Set(agents.map((agent) => agent.name.toLowerCase())), [agents]);

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
    loadAgents();
    loadCommands();
  }, []);

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
      const response = await fetch(`/api/find-files?q=${encodeURIComponent(mention.query)}`).catch(() => null);
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
    const parts: Array<{ type: "text"; text: string } | { type: "file"; path: string; content?: string }> = [];
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
      onSend(parts);
      setValue("");
    } catch (error) {
      toast.error("Unable to prepare message");
    }
  }, [disabled, onSend, parseParts, value]);

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
    <div className="relative flex items-end gap-2 rounded-xl border border-border/60 bg-card p-3 shadow-sm">
      <Popover open={isOpen && suggestions.length > 0} onOpenChange={setIsOpen}>
        <PopoverAnchor asChild>
          <div className="flex-1">
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message... (Shift+Enter for new line)"
              disabled={disabled}
              rows={1}
              className={cn(
                "min-h-[36px] max-h-48 flex-1 resize-none border-0 bg-transparent p-0 shadow-none",
                "focus-visible:ring-0 text-sm placeholder:text-muted-foreground/60"
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
      <Button
        size="icon"
        onClick={handleSubmit}
        disabled={!value.trim() || disabled}
        className="h-8 w-8 shrink-0 rounded-lg"
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default MessageComposer;

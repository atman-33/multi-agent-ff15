import { Check, ChevronsUpDown, Cpu } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import type { ModelSelection } from "@/stores/chat-store";
import type { AgentStatus } from "./character-card";
import { CharacterCard } from "./character-card";

export interface PartyMember {
  id: string;
  name: string;
  role: string;
  imageSrc: string;
  status: AgentStatus;
  task: string;
  detail?: string;
  progress?: number;
}

type Provider = {
  id: string;
  name: string;
  models: Record<string, { id: string; name: string }>;
};

type ModelItem = {
  providerID: string;
  providerName: string;
  modelID: string;
  modelName: string;
};

const AgentModelPicker = memo(
  ({
    agentId,
    modelItems,
    selectedModel,
    onSelect,
  }: {
    agentId: string;
    modelItems: ModelItem[];
    selectedModel: ModelSelection | null;
    onSelect: (model: ModelSelection | null) => void;
  }) => {
    const [open, setOpen] = useState(false);

    const label = useMemo(() => {
      if (!selectedModel) return null;
      const found = modelItems.find(
        (m) => m.providerID === selectedModel.providerID && m.modelID === selectedModel.modelID
      );
      return found ? `${found.providerName} / ${found.modelName}` : selectedModel.modelID;
    }, [modelItems, selectedModel]);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <Button
            variant="ghost"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-label={`Select model for ${agentId}`}
            className={cn(
              "h-7 w-[240px] justify-between gap-1.5 px-2 font-mono text-[10px] uppercase tracking-widest",
              selectedModel
                ? "text-primary/80 hover:text-primary"
                : "text-muted-foreground/50 hover:text-muted-foreground"
            )}
            onClick={() => setOpen((v) => !v)}
          >
            <Cpu className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{label ?? "model"}</span>
            <ChevronsUpDown className="h-2.5 w-2.5 shrink-0 opacity-50" />
          </Button>
        </PopoverAnchor>

        <PopoverContent align="end" className="w-96 p-0" side="bottom">
          <Command>
            <CommandInput placeholder="Search models..." />
            <CommandList>
              <CommandEmpty>No model found.</CommandEmpty>
              <CommandGroup heading="Models">
                <CommandItem
                  value="default model"
                  onSelect={() => {
                    onSelect(null);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-4 w-4", !selectedModel ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <div className="truncate text-sm">Default</div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      Use OpenCode default model
                    </div>
                  </div>
                </CommandItem>
                {modelItems.map((item) => {
                  const isSelected =
                    selectedModel?.providerID === item.providerID &&
                    selectedModel?.modelID === item.modelID;
                  return (
                    <CommandItem
                      key={`${item.providerID}-${item.modelID}`}
                      value={`${item.providerName} ${item.modelName} ${item.providerID} ${item.modelID}`}
                      onSelect={() => {
                        onSelect({ providerID: item.providerID, modelID: item.modelID });
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                      <div className="min-w-0">
                        <div className="truncate text-sm">
                          {item.providerName} / {item.modelName}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {item.providerID} / {item.modelID}
                        </div>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }
);

AgentModelPicker.displayName = "AgentModelPicker";

interface PartyStatusPanelProps {
  members: PartyMember[];
}

export const PartyStatusPanel = ({ members }: PartyStatusPanelProps) => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const agentModels = useChatStore((state) => state.agentModels);
  const setAgentModel = useChatStore((state) => state.setAgentModel);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/providers").catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { providers?: Provider[] };
      setProviders(data.providers ?? []);
    };
    void load();
  }, []);

  const modelItems = useMemo<ModelItem[]>(
    () =>
      providers.flatMap((provider) =>
        Object.values(provider.models ?? {}).map((model) => ({
          providerID: provider.id,
          providerName: provider.name,
          modelID: model.id,
          modelName: model.name,
        }))
      ),
    [providers]
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-border/50 border-b pb-2">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Party Status
        </span>
        <div className="ml-auto font-mono text-[10px] text-muted-foreground/50">
          {members.filter((m) => m.status === "working").length} active
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        {members.map((member) => (
          <div key={member.id} className="relative">
            <CharacterCard {...member} />
            <div className="absolute top-1 right-1 z-10">
              <AgentModelPicker
                agentId={member.id}
                modelItems={modelItems}
                selectedModel={agentModels[member.id] ?? null}
                onSelect={(model) => setAgentModel(member.id, model)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

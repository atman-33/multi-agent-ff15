import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatStore } from "@/stores/chat-store";

type Provider = {
  id: string;
  name: string;
  models: Record<string, { id: string; name: string }>;
};

type ProvidersResponse = {
  providers: Provider[];
  default: Record<string, string>;
};

const ModelSelector = () => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);

  useEffect(() => {
    const loadProviders = async () => {
      const response = await fetch("/api/providers");
      if (!response.ok) return;
      const data = (await response.json()) as ProvidersResponse;
      setProviders(data.providers ?? []);
      const currentModel = useChatStore.getState().selectedModel;
      if (!currentModel && data.providers?.length) {
        const provider = data.providers[0];
        const firstModel = Object.values(provider.models ?? {})[0];
        if (provider && firstModel) {
          useChatStore.getState().setSelectedModel({ providerID: provider.id, modelID: firstModel.id });
        }
      }
    };
    loadProviders();
  }, []);

  const items = useMemo(() => {
    return providers.flatMap((provider) =>
      Object.values(provider.models ?? {}).map((model) => ({
        providerID: provider.id,
        providerName: provider.name,
        modelID: model.id,
        modelName: model.name,
      }))
    );
  }, [providers]);

  const currentLabel = useMemo(() => {
    const current = items.find(
      (item) => item.providerID === selectedModel?.providerID && item.modelID === selectedModel.modelID
    );
    if (current) return `${current.providerName} / ${current.modelName}`;
    return "Select Model";
  }, [items, selectedModel]);

  const handleSelect = useCallback(
    (providerID: string, modelID: string) => {
      setSelectedModel({ providerID, modelID });
    },
    [setSelectedModel]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {currentLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 overflow-auto">
        <DropdownMenuLabel>Models</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((item) => (
          <DropdownMenuItem
            key={`${item.providerID}-${item.modelID}`}
            onClick={() => handleSelect(item.providerID, item.modelID)}
          >
            {item.providerName} / {item.modelName}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ModelSelector;

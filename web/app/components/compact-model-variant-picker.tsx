import { Check, ChevronRight, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  DEFAULT_VARIANT_VALUE,
  getModelKey,
  getVariantOptions,
} from "@/lib/model-variant-selection";
import {
  findModelCatalogItem,
  type ModelCatalogItem,
} from "@/lib/opencode-provider-catalog";
import type { ModelSelection } from "@/lib/types/mission";
import { cn } from "@/lib/utils";

type CompactModelVariantPickerProps = {
  ariaLabel: string;
  contentAlign?: "center" | "end" | "start";
  contentClassName?: string;
  contentSide?: "bottom" | "left" | "right" | "top";
  disabled?: boolean;
  emptyLabel: string;
  modelItems: ModelCatalogItem[];
  onSelect: (model: ModelSelection) => void;
  selectedModel: ModelSelection | null;
  showProviderName?: boolean;
  triggerClassName?: string;
  triggerIcon?: ReactNode;
  variantsByModel: Record<string, string[]>;
};

export function CompactModelVariantPicker({
  ariaLabel,
  contentAlign = "start",
  contentClassName,
  contentSide = "bottom",
  disabled = false,
  emptyLabel,
  modelItems,
  onSelect,
  selectedModel,
  showProviderName = true,
  triggerClassName,
  triggerIcon,
  variantsByModel,
}: CompactModelVariantPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeModelKey, setActiveModelKey] = useState<string | null>(null);

  const displayItems = useMemo(() => {
    const currentSelectionMissing =
      selectedModel && !findModelCatalogItem(modelItems, selectedModel)
        ? [
            {
              providerID: selectedModel.providerID,
              providerName: selectedModel.providerID,
              modelID: selectedModel.modelID,
              modelName: selectedModel.modelID,
            },
          ]
        : [];

    return [...currentSelectionMissing, ...modelItems];
  }, [modelItems, selectedModel]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return displayItems;
    }

    return displayItems.filter((item) => {
      const haystack = [
        item.providerName,
        item.modelName,
        item.providerID,
        item.modelID,
        `${item.providerID}/${item.modelID}`,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [displayItems, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }

    const selectedKey = getModelKey(selectedModel);
    const firstFilteredKey = filteredItems[0]
      ? `${filteredItems[0].providerID}/${filteredItems[0].modelID}`
      : null;
    setActiveModelKey(selectedKey ?? firstFilteredKey);
  }, [filteredItems, open, selectedModel]);

  const selectedItem = useMemo(
    () => findModelCatalogItem(displayItems, selectedModel),
    [displayItems, selectedModel]
  );

  const activeItem = useMemo(() => {
    if (!activeModelKey) {
      return filteredItems[0] ?? null;
    }

    return (
      filteredItems.find(
        (item) => `${item.providerID}/${item.modelID}` === activeModelKey
      ) ?? filteredItems[0] ?? null
    );
  }, [activeModelKey, filteredItems]);

  const currentLabel = useMemo(() => {
    if (!selectedItem) {
      return emptyLabel;
    }

    return showProviderName
      ? `${selectedItem.providerName} / ${selectedItem.modelName}`
      : selectedItem.modelName;
  }, [emptyLabel, selectedItem, showProviderName]);

  const activeVariantOptions = useMemo(() => {
    if (!activeItem) {
      return [];
    }

    const activeKey = `${activeItem.providerID}/${activeItem.modelID}`;
    const currentVariant = getModelKey(selectedModel) === activeKey ? selectedModel?.variant : undefined;
    return getVariantOptions(
      { providerID: activeItem.providerID, modelID: activeItem.modelID },
      currentVariant,
      variantsByModel
    );
  }, [activeItem, selectedModel, variantsByModel]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Button
          variant="ghost"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn("justify-between gap-2", triggerClassName)}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {triggerIcon ? <span className="shrink-0">{triggerIcon}</span> : null}
            <span className="min-w-0 truncate text-left">{currentLabel}</span>
            {selectedModel?.variant ? (
              <span className="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-primary/80">
                {selectedModel.variant}
              </span>
            ) : null}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverAnchor>

      <PopoverContent align={contentAlign} className={cn("w-[min(46rem,92vw)] p-0", contentClassName)} side={contentSide}>
        <div className="grid gap-0 sm:grid-cols-[minmax(0,1.6fr)_minmax(14rem,1fr)]">
          <div className="border-b border-border/60 p-2 sm:border-r sm:border-b-0">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models..."
              className="h-8 border-border/60 bg-background/70 px-2 text-xs"
            />

            <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-border/50 bg-background/40 p-1">
              {filteredItems.length === 0 ? (
                <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                  No model found.
                </div>
              ) : (
                filteredItems.map((item) => {
                  const itemKey = `${item.providerID}/${item.modelID}`;
                  const isActive = itemKey === `${activeItem?.providerID}/${activeItem?.modelID}`;
                  const isSelected =
                    selectedModel?.providerID === item.providerID &&
                    selectedModel?.modelID === item.modelID;
                  const hasVariants = (variantsByModel[itemKey] ?? []).length > 0;

                  return (
                    <button
                      key={itemKey}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                      )}
                      onMouseEnter={() => setActiveModelKey(itemKey)}
                      onFocus={() => setActiveModelKey(itemKey)}
                      onClick={() => {
                        onSelect({ providerID: item.providerID, modelID: item.modelID });
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn("h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">
                          {item.providerName} / {item.modelName}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {item.providerID} / {item.modelID}
                        </div>
                      </div>
                      {hasVariants ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-55" />
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="p-2">
            <div className="rounded-md border border-border/50 bg-background/30">
              <div className="border-border/50 border-b px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {activeItem ? `Variants for ${activeItem.modelName}` : "Variants"}
              </div>

              <div className="max-h-72 overflow-y-auto p-1">
                {!activeItem ? (
                  <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                    Select a model to inspect variants.
                  </div>
                ) : (
                  activeVariantOptions.map((option) => {
                    const nextSelection: ModelSelection = {
                      providerID: activeItem.providerID,
                      modelID: activeItem.modelID,
                      ...(option.value === DEFAULT_VARIANT_VALUE
                        ? {}
                        : { variant: option.value }),
                    };
                    const isSelected =
                      selectedModel?.providerID === nextSelection.providerID &&
                      selectedModel?.modelID === nextSelection.modelID &&
                      selectedModel?.variant === nextSelection.variant;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={option.unavailable}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors",
                          isSelected
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                          option.unavailable ? "cursor-not-allowed opacity-60" : null
                        )}
                        onClick={() => {
                          if (option.unavailable) {
                            return;
                          }

                          onSelect(nextSelection);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn("h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{option.label}</div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {option.value === DEFAULT_VARIANT_VALUE
                              ? "Use the provider default variant"
                              : option.unavailable
                                ? "Current variant is no longer available"
                                : `${activeItem.providerID} / ${activeItem.modelID}`}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
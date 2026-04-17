import { Check, ChevronRight, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  buildModelSelection,
  getExplicitVariantOptions,
  getModelKey,
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
  portalContainer?: HTMLElement | null;
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
  portalContainer = null,
  selectedModel,
  showProviderName = true,
  triggerClassName,
  triggerIcon,
  variantsByModel,
}: CompactModelVariantPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeModelKey, setActiveModelKey] = useState<string | null>(null);
  const [openVariantKey, setOpenVariantKey] = useState<string | null>(null);
  const variantCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (variantCloseTimerRef.current) {
        clearTimeout(variantCloseTimerRef.current);
        variantCloseTimerRef.current = null;
      }
      setQuery("");
      setOpenVariantKey(null);
      return;
    }

    const selectedKey = getModelKey(selectedModel);
    const firstFilteredKey = filteredItems[0]
      ? `${filteredItems[0].providerID}/${filteredItems[0].modelID}`
      : null;
    setActiveModelKey(selectedKey ?? firstFilteredKey);
  }, [filteredItems, open, selectedModel]);

  useEffect(() => {
    if (!openVariantKey) {
      return;
    }

    const stillVisible = filteredItems.some(
      (item) => `${item.providerID}/${item.modelID}` === openVariantKey
    );

    if (!stillVisible) {
      setOpenVariantKey(null);
    }
  }, [filteredItems, openVariantKey]);

  useEffect(() => {
    return () => {
      if (variantCloseTimerRef.current) {
        clearTimeout(variantCloseTimerRef.current);
      }
    };
  }, []);

  const selectedItem = useMemo(
    () => findModelCatalogItem(displayItems, selectedModel),
    [displayItems, selectedModel]
  );

  const currentLabel = useMemo(() => {
    if (!selectedItem) {
      return emptyLabel;
    }

    return showProviderName
      ? `${selectedItem.providerName} / ${selectedItem.modelName}`
      : selectedItem.modelName;
  }, [emptyLabel, selectedItem, showProviderName]);

  const selectedModelKey = getModelKey(selectedModel);
  const variantCollisionBoundary = portalContainer ? [portalContainer] : undefined;

  const clearVariantCloseTimer = () => {
    if (variantCloseTimerRef.current) {
      clearTimeout(variantCloseTimerRef.current);
      variantCloseTimerRef.current = null;
    }
  };

  const openVariantFlyout = (itemKey: string, hasExplicitVariants: boolean) => {
    clearVariantCloseTimer();
    setActiveModelKey(itemKey);
    setOpenVariantKey(hasExplicitVariants ? itemKey : null);
  };

  const scheduleVariantClose = (itemKey: string) => {
    clearVariantCloseTimer();
    variantCloseTimerRef.current = setTimeout(() => {
      setOpenVariantKey((current) => (current === itemKey ? null : current));
      variantCloseTimerRef.current = null;
    }, 140);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn("justify-between gap-2", triggerClassName)}
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
      </PopoverTrigger>

      <PopoverContent
        align={contentAlign}
        className={cn("w-[min(25rem,92vw)] p-0", contentClassName)}
        portalContainer={portalContainer}
        side={contentSide}
      >
        <div className="border-border/60 border-b px-2 py-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search models..."
            className="h-8 border-border/60 bg-background/70 px-2 text-xs"
          />
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="px-2 py-8 text-center text-xs text-muted-foreground">
              No model found.
            </div>
          ) : (
            <div className="space-y-1">
              {filteredItems.map((item) => {
                const itemKey = `${item.providerID}/${item.modelID}`;
                const isActive = itemKey === activeModelKey;
                const isSelected =
                  selectedModel?.providerID === item.providerID &&
                  selectedModel?.modelID === item.modelID;
                const currentVariant = selectedModelKey === itemKey ? selectedModel?.variant : undefined;
                const explicitVariantOptions = getExplicitVariantOptions(
                  { providerID: item.providerID, modelID: item.modelID },
                  currentVariant,
                  variantsByModel
                );
                const hasExplicitVariants = explicitVariantOptions.length > 0;
                const isVariantFlyoutOpen = hasExplicitVariants && openVariantKey === itemKey;

                const row = (
                  <div
                    className={cn(
                      "flex items-center gap-1 rounded-lg border border-transparent transition-colors",
                      isActive || isVariantFlyoutOpen
                        ? "border-border/60 bg-accent text-accent-foreground"
                        : "hover:bg-accent/60"
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
                      onFocus={() => openVariantFlyout(itemKey, hasExplicitVariants)}
                      onClick={() => {
                        onSelect(buildModelSelection(item));
                        setOpen(false);
                      }}
                      onMouseEnter={() => openVariantFlyout(itemKey, hasExplicitVariants)}
                      onMouseLeave={() => {
                        if (hasExplicitVariants) {
                          scheduleVariantClose(itemKey);
                        }
                      }}
                    >
                      <Check
                        className={cn("h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")}
                      />

                      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                        <span className="truncate font-medium text-sm text-foreground">
                          {item.modelName}
                        </span>
                        <span className="shrink-0 rounded-full border border-border/60 bg-background/80 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                          {item.providerName}
                        </span>
                      </div>

                      {isSelected && currentVariant ? (
                        <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-primary/80">
                          {currentVariant}
                        </span>
                      ) : null}
                    </button>

                    {hasExplicitVariants ? (
                      <button
                        type="button"
                        aria-label={`Open variants for ${item.modelName}`}
                        className={cn(
                          "mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground",
                          isVariantFlyoutOpen && "bg-background/80 text-foreground"
                        )}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          clearVariantCloseTimer();
                          setActiveModelKey(itemKey);
                          setOpenVariantKey((current) => (current === itemKey ? null : itemKey));
                        }}
                        onFocus={() => openVariantFlyout(itemKey, hasExplicitVariants)}
                        onMouseEnter={() => openVariantFlyout(itemKey, hasExplicitVariants)}
                        onMouseLeave={() => scheduleVariantClose(itemKey)}
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                );

                if (!hasExplicitVariants) {
                  return <div key={itemKey}>{row}</div>;
                }

                return (
                  <Popover key={itemKey} open={isVariantFlyoutOpen}>
                    <PopoverAnchor asChild>{row}</PopoverAnchor>
                    <PopoverContent
                      align="start"
                      className="w-60 p-1 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2"
                      collisionBoundary={variantCollisionBoundary}
                      collisionPadding={12}
                      onFocusCapture={() => {
                        clearVariantCloseTimer();
                        setActiveModelKey(itemKey);
                        setOpenVariantKey(itemKey);
                      }}
                      onMouseEnter={() => {
                        clearVariantCloseTimer();
                        setActiveModelKey(itemKey);
                        setOpenVariantKey(itemKey);
                      }}
                      onMouseLeave={() => scheduleVariantClose(itemKey)}
                      onOpenAutoFocus={(event) => event.preventDefault()}
                      portalContainer={portalContainer}
                      side="right"
                      sideOffset={10}
                    >
                      <div className="border-border/50 border-b px-2 py-2">
                        <div className="truncate font-medium text-foreground text-sm">
                          {item.modelName}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="rounded-full border border-border/60 bg-background/80 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                            {item.providerName}
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                            Explicit variants
                          </span>
                        </div>
                      </div>

                      <div className="max-h-72 overflow-y-auto p-1">
                        {explicitVariantOptions.map((option) => {
                          const nextSelection = buildModelSelection(item, option.value);
                          const isVariantSelected =
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
                                isVariantSelected
                                  ? "bg-primary/10 text-primary"
                                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                                option.unavailable && "cursor-not-allowed opacity-60"
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
                                className={cn(
                                  "h-4 w-4 shrink-0",
                                  isVariantSelected ? "opacity-100" : "opacity-0"
                                )}
                              />

                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm">{option.label}</div>
                                {option.unavailable ? (
                                  <div className="truncate text-[10px] text-muted-foreground">
                                    Current variant is no longer available
                                  </div>
                                ) : null}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
export type OhMyOpenCodeConfigSection = "agents" | "categories";

export type CatalogRefreshState = "ready" | "refreshing" | "error" | "unavailable";

export interface ModelEntry {
  model: string;
  variant?: string;
}

export interface OhMyOpenCodeConfig {
  agents?: Record<string, ModelEntry>;
  categories?: Record<string, ModelEntry>;
}

export interface OhMyOpenCodeCatalogStatus {
  generatedAt: string | null;
  lastError?: string;
  refreshState: CatalogRefreshState;
  stale: boolean;
}

export interface OhMyOpenCodeData {
  config: OhMyOpenCodeConfig | null;
  error?: string;
  isInstalled: boolean;
  models: string[];
  variantsByModel: Record<string, string[]>;
  version: string;
  catalog: OhMyOpenCodeCatalogStatus;
}

export interface VariantOption {
  label: string;
  unavailable?: boolean;
  value: string;
}

export const DEFAULT_VARIANT_VALUE = "__default__";

export function getModelOptions(currentModel: string | undefined, models: string[]): string[] {
  if (!currentModel) {
    return models;
  }

  return models.includes(currentModel) ? models : [currentModel, ...models];
}

export function getVariantOptions(
  model: string | undefined,
  currentVariant: string | undefined,
  variantsByModel: Record<string, string[]>
): VariantOption[] {
  const options: VariantOption[] = [{ label: "Default", value: DEFAULT_VARIANT_VALUE }];
  const availableVariants = model ? variantsByModel[model] ?? [] : [];

  if (currentVariant && !availableVariants.includes(currentVariant)) {
    options.push({
      label: `${currentVariant} (current)`,
      unavailable: true,
      value: currentVariant,
    });
  }

  options.push(...availableVariants.map((variant) => ({ label: variant, value: variant })));

  return options;
}

export function isVariantSelectionDisabled(
  model: string | undefined,
  currentVariant: string | undefined,
  variantsByModel: Record<string, string[]>
): boolean {
  return getVariantOptions(model, currentVariant, variantsByModel).length === 1;
}

export function resolveVariantForModelChange(
  currentVariant: string | undefined,
  nextModel: string,
  variantsByModel: Record<string, string[]>
): string | undefined {
  if (!currentVariant) {
    return undefined;
  }

  return (variantsByModel[nextModel] ?? []).includes(currentVariant) ? currentVariant : undefined;
}

function buildNextEntry(
  entry: ModelEntry | undefined,
  model: string,
  variant: string | undefined
): ModelEntry {
  const nextEntry: ModelEntry = {
    ...(entry ?? { model }),
    model,
  };

  if (variant) {
    nextEntry.variant = variant;
  } else {
    delete nextEntry.variant;
  }

  return nextEntry;
}

export function updateConfigModelSelection(
  config: OhMyOpenCodeConfig,
  section: OhMyOpenCodeConfigSection,
  key: string,
  model: string,
  variantsByModel: Record<string, string[]>
): OhMyOpenCodeConfig {
  const currentEntry = config[section]?.[key];
  const nextVariant = resolveVariantForModelChange(currentEntry?.variant, model, variantsByModel);

  return {
    ...config,
    [section]: {
      ...config[section],
      [key]: buildNextEntry(currentEntry, model, nextVariant),
    },
  };
}

export function updateConfigVariantSelection(
  config: OhMyOpenCodeConfig,
  section: OhMyOpenCodeConfigSection,
  key: string,
  value: string
): OhMyOpenCodeConfig {
  const currentEntry = config[section]?.[key];
  if (!currentEntry?.model) {
    return config;
  }

  const nextVariant = value === DEFAULT_VARIANT_VALUE ? undefined : value;

  return {
    ...config,
    [section]: {
      ...config[section],
      [key]: buildNextEntry(currentEntry, currentEntry.model, nextVariant),
    },
  };
}
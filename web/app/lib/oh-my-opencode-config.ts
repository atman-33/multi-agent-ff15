import {
  DEFAULT_VARIANT_VALUE,
  getModelOptions,
  getVariantOptions,
  isVariantSelectionDisabled,
  parseModelReference,
  resolveVariantForModelChange,
  type VariantOption,
} from "@/lib/model-variant-selection";
import type { ModelSelection } from "@/lib/types/mission";

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
  catalog: OhMyOpenCodeCatalogStatus;
  config: OhMyOpenCodeConfig | null;
  error?: string;
  isInstalled: boolean;
  models: string[];
  providers: Array<{
    id: string;
    models: Record<string, { id: string; name: string }>;
    name: string;
  }>;
  variantsByModel: Record<string, string[]>;
  version: string;
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

export function getModelSelectionFromEntry(
  entry: ModelEntry | null | undefined
): ModelSelection | null {
  return parseModelReference(entry?.model, entry?.variant);
}

export function updateConfigPickerSelection(
  config: OhMyOpenCodeConfig,
  section: OhMyOpenCodeConfigSection,
  key: string,
  selection: ModelSelection,
  variantsByModel: Record<string, string[]>
): OhMyOpenCodeConfig {
  const nextModel = `${selection.providerID}/${selection.modelID}`;
  const nextConfig = updateConfigModelSelection(
    config,
    section,
    key,
    nextModel,
    variantsByModel
  );

  return updateConfigVariantSelection(
    nextConfig,
    section,
    key,
    selection.variant ?? DEFAULT_VARIANT_VALUE
  );
}

export {
  DEFAULT_VARIANT_VALUE,
  getModelOptions,
  getVariantOptions,
  isVariantSelectionDisabled,
  resolveVariantForModelChange,
  type VariantOption,
};
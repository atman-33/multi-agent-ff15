import type { ModelSelection } from "@/lib/types/mission";

type ModelKeyInput =
  | Pick<ModelSelection, "providerID" | "modelID">
  | string
  | null
  | undefined;

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

export function getModelKey(model: ModelKeyInput): string | undefined {
  if (!model) {
    return undefined;
  }

  if (typeof model === "string") {
    return model;
  }

  return `${model.providerID}/${model.modelID}`;
}

export function getVariantOptions(
  model: ModelKeyInput,
  currentVariant: string | undefined,
  variantsByModel: Record<string, string[]>
): VariantOption[] {
  const options: VariantOption[] = [{ label: "Default", value: DEFAULT_VARIANT_VALUE }];
  const modelKey = getModelKey(model);
  const availableVariants = modelKey ? variantsByModel[modelKey] ?? [] : [];

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

export function getExplicitVariantOptions(
  model: ModelKeyInput,
  currentVariant: string | undefined,
  variantsByModel: Record<string, string[]>
): VariantOption[] {
  return getVariantOptions(model, currentVariant, variantsByModel).filter(
    (option) => option.value !== DEFAULT_VARIANT_VALUE
  );
}

export function buildModelSelection(
  model: Pick<ModelSelection, "providerID" | "modelID">,
  variant?: string | null
): ModelSelection {
  if (!variant || variant === DEFAULT_VARIANT_VALUE) {
    return {
      providerID: model.providerID,
      modelID: model.modelID,
    };
  }

  return {
    providerID: model.providerID,
    modelID: model.modelID,
    variant,
  };
}

export function isVariantSelectionDisabled(
  model: ModelKeyInput,
  currentVariant: string | undefined,
  variantsByModel: Record<string, string[]>
): boolean {
  return getExplicitVariantOptions(model, currentVariant, variantsByModel).length === 0;
}

export function resolveVariantForModelChange(
  currentVariant: string | undefined,
  nextModel: ModelKeyInput,
  variantsByModel: Record<string, string[]>
): string | undefined {
  if (!currentVariant) {
    return undefined;
  }

  const modelKey = getModelKey(nextModel);
  if (!modelKey) {
    return undefined;
  }

  return (variantsByModel[modelKey] ?? []).includes(currentVariant) ? currentVariant : undefined;
}

export function areModelSelectionsEqual(
  left: ModelSelection | null | undefined,
  right: ModelSelection | null | undefined
): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.providerID === right.providerID &&
    left.modelID === right.modelID &&
    left.variant === right.variant
  );
}

export function isModelSelection(value: unknown): value is ModelSelection {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.providerID === "string" &&
    typeof candidate.modelID === "string" &&
    (candidate.variant === undefined || typeof candidate.variant === "string")
  );
}

export function splitModelSelection(
  value: ModelSelection | null | undefined
): {
  model?: { modelID: string; providerID: string };
  variant?: string;
} {
  if (!value) {
    return {};
  }

  return {
    model: {
      providerID: value.providerID,
      modelID: value.modelID,
    },
    ...(value.variant ? { variant: value.variant } : {}),
  };
}

export function parseModelReference(
  value: unknown,
  variant?: unknown
): ModelSelection | null {
  if (typeof value !== "string") {
    return null;
  }

  const slashIndex = value.indexOf("/");
  if (slashIndex <= 0 || slashIndex >= value.length - 1) {
    return null;
  }

  const parsedVariant =
    typeof variant === "string" && variant.trim().length > 0 ? variant.trim() : undefined;

  return {
    providerID: value.slice(0, slashIndex),
    modelID: value.slice(slashIndex + 1),
    ...(parsedVariant ? { variant: parsedVariant } : {}),
  };
}
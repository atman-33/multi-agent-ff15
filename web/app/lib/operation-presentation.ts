import type { OperationCatalogEntry } from "@/lib/operation-definition/operation-catalog";
import { INTERNAL_AUTONOMOUS_OPERATION_NAME } from "@/lib/operation-runtime/constants";

export interface OperationOption {
  value: string;
  label: string;
  description: string;
  isDefault: boolean;
  name: string;
  projectId?: string;
  sourceKind: "builtin" | "project";
  sourceLabel: string;
}

export const DEFAULT_AUTONOMOUS_OPERATION_LABEL = "Default (Autonomous)";

export function getOperationDisplayLabel(operationName: string): string {
  return operationName === INTERNAL_AUTONOMOUS_OPERATION_NAME
    ? DEFAULT_AUTONOMOUS_OPERATION_LABEL
    : operationName;
}

export function normalizeOperationDescription(description: string): string {
  return description.replace(/\s+/g, " ").trim();
}

function getOperationSourceLabel(operation: Pick<OperationCatalogEntry, "projectId" | "projectName" | "sourceKind">): string {
  if (operation.sourceKind === "project") {
    return operation.projectName || operation.projectId || "Project";
  }

  return "Builtin";
}

function buildOperationOptionLabel(operation: Pick<OperationCatalogEntry, "name" | "projectId" | "projectName" | "sourceKind">): string {
  const displayName = getOperationDisplayLabel(operation.name);
  if (operation.sourceKind === "project") {
    return `${displayName} · ${getOperationSourceLabel(operation)}`;
  }

  return displayName;
}

export function toOperationOption(
  operation: Pick<
    OperationCatalogEntry,
    "description" | "isDefault" | "name" | "projectId" | "projectName" | "ref" | "sourceKind"
  >,
): OperationOption {
  return {
    value: operation.ref,
    label: buildOperationOptionLabel(operation),
    description: normalizeOperationDescription(operation.description),
    isDefault: operation.isDefault,
    name: operation.name,
    projectId: operation.projectId,
    sourceKind: operation.sourceKind,
    sourceLabel: getOperationSourceLabel(operation),
  };
}

export function compareOperationOptions(left: OperationOption, right: OperationOption): number {
  if (left.isDefault !== right.isDefault) {
    return left.isDefault ? -1 : 1;
  }

  return left.label.localeCompare(right.label) || left.value.localeCompare(right.value);
}
import type { OperationDefinition } from "@/lib/operation-definition/types";
import { INTERNAL_AUTONOMOUS_OPERATION_NAME } from "@/lib/operation-runtime/constants";

export interface OperationOption {
  value: string;
  label: string;
  description: string;
  isDefault: boolean;
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

export function toOperationOption(
  operation: Pick<OperationDefinition, "name" | "description">,
): OperationOption {
  return {
    value: operation.name,
    label: getOperationDisplayLabel(operation.name),
    description: normalizeOperationDescription(operation.description),
    isDefault: operation.name === INTERNAL_AUTONOMOUS_OPERATION_NAME,
  };
}

export function compareOperationOptions(left: OperationOption, right: OperationOption): number {
  if (left.isDefault !== right.isDefault) {
    return left.isDefault ? -1 : 1;
  }

  return left.label.localeCompare(right.label);
}
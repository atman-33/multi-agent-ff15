import type { ProjectScope } from "@/lib/project-scopes";

export interface OperationStudioBuiltinAuthoringTarget {
  kind: "builtin";
  projectId: null;
}

export interface OperationStudioProjectAuthoringTarget {
  kind: "project";
  projectId: string;
}

export type OperationStudioAuthoringTarget =
  | OperationStudioBuiltinAuthoringTarget
  | OperationStudioProjectAuthoringTarget;

export interface OperationStudioCatalogOptions {
  scope: ProjectScope;
  target: OperationStudioAuthoringTarget;
}
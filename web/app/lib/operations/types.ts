import type { ProjectScope } from "@/lib/project-scopes";

export interface OperationsBuiltinAuthoringTarget {
  kind: "builtin";
  projectId: null;
}

export interface OperationsProjectAuthoringTarget {
  kind: "project";
  projectId: string;
}

export type OperationsAuthoringTarget =
  | OperationsBuiltinAuthoringTarget
  | OperationsProjectAuthoringTarget;

export interface OperationsCatalogOptions {
  scope: ProjectScope;
  target: OperationsAuthoringTarget;
}
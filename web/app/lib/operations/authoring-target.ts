import type { OperationsAuthoringTarget } from "./types";

export function parseOperationsAuthoringTarget(
  rawValue: string,
): OperationsAuthoringTarget {
  const value = rawValue.trim();
  if (value === "builtin") {
    return {
      kind: "builtin",
      projectId: null,
    };
  }

  if (value.startsWith("project:")) {
    const projectId = value.slice("project:".length).trim();
    if (projectId.length > 0) {
      return {
        kind: "project",
        projectId,
      };
    }
  }

  throw new Error(`Unsupported Operations authoring target: ${rawValue}`);
}
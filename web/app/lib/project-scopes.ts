export const PROJECT_SCOPES = ["noctis_team", "lunafreya"] as const;

export type ProjectScope = (typeof PROJECT_SCOPES)[number];

export type ProjectScopedAgentId =
  | "noctis"
  | "lunafreya"
  | "ignis"
  | "gladiolus"
  | "prompto"
  | "iris";

export const PROJECT_SCOPE_LABELS: Record<ProjectScope, string> = {
  noctis_team: "Noctis Team",
  lunafreya: "Lunafreya",
};

export const PROJECT_SCOPE_DESCRIPTIONS: Record<ProjectScope, string> = {
  noctis_team: "Shared by Noctis, Ignis, Gladiolus, and Prompto",
  lunafreya: "Independent project context for Lunafreya",
};

export function getProjectScopeForAgent(agent: ProjectScopedAgentId): ProjectScope | null {
  if (agent === "lunafreya") {
    return "lunafreya";
  }

  if (agent === "noctis" || agent === "ignis" || agent === "gladiolus" || agent === "prompto") {
    return "noctis_team";
  }

  return null;
}

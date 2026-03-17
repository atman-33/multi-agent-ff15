export const NOCTIS_FORMATION_OPTIONS = [
  {
    id: "auto",
    label: "Auto",
    summary: "Default team routing",
  },
  {
    id: "solo",
    label: "Solo",
    summary: "Noctis only",
    commandPath: ".opencode/command/solo-noctis.md",
  },
  {
    id: "duo-ignis",
    label: "Duo: Ignis",
    summary: "Noctis + Ignis only",
    commandPath: ".opencode/command/duo-ignis.md",
  },
  {
    id: "duo-gladiolus",
    label: "Duo: Gladiolus",
    summary: "Noctis + Gladiolus only",
    commandPath: ".opencode/command/duo-gladiolus.md",
  },
  {
    id: "duo-prompto",
    label: "Duo: Prompto",
    summary: "Noctis + Prompto only",
    commandPath: ".opencode/command/duo-prompto.md",
  },
] as const;

export type NoctisFormationId = (typeof NOCTIS_FORMATION_OPTIONS)[number]["id"];

export const DEFAULT_NOCTIS_FORMATION: NoctisFormationId = "auto";

export const NOCTIS_FORMATION_STORAGE_KEY = "chat_noctis_formation";

export const NOCTIS_FORMATION_BY_ID = Object.fromEntries(
  NOCTIS_FORMATION_OPTIONS.map((option) => [option.id, option])
) as Record<NoctisFormationId, (typeof NOCTIS_FORMATION_OPTIONS)[number]>;

export function isNoctisFormationId(value: string): value is NoctisFormationId {
  return value in NOCTIS_FORMATION_BY_ID;
}

export function buildNoctisFormationPreamble(formation: NoctisFormationId) {
  const option = NOCTIS_FORMATION_BY_ID[formation];
  if (!(option && "commandPath" in option && option.commandPath)) {
    return "";
  }
  return `Follow instructions in ${option.commandPath}.`;
}

export const WORKING_PARTY_MEMBER_IDS = ["ignis", "gladiolus", "prompto"] as const;

export type WorkingPartyMemberId = (typeof WORKING_PARTY_MEMBER_IDS)[number];
export type WorkingPartyState = Record<WorkingPartyMemberId, boolean>;
export type NoctisExecutionMode = "solo" | "orchestrated";
export type NoctisAgentProfile = "noctis" | "noctis-solo";

const WORKING_PARTY_MEMBER_NAMES: Record<WorkingPartyMemberId, string> = {
  ignis: "Ignis",
  gladiolus: "Gladiolus",
  prompto: "Prompto",
};

export function createDefaultWorkingPartyState(): WorkingPartyState {
  return {
    ignis: true,
    gladiolus: true,
    prompto: true,
  };
}

export function isWorkingPartyMemberId(value: string): value is WorkingPartyMemberId {
  return WORKING_PARTY_MEMBER_IDS.includes(value as WorkingPartyMemberId);
}

export function normalizeWorkingPartyMemberId(value: string): WorkingPartyMemberId | null {
  if (value === "gladio") {
    return "gladiolus";
  }

  return isWorkingPartyMemberId(value) ? value : null;
}

export function coerceAllowedWorkers(value: unknown): WorkingPartyMemberId[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<WorkingPartyMemberId>();
  const allowedWorkers: WorkingPartyMemberId[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const normalized = normalizeWorkingPartyMemberId(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    allowedWorkers.push(normalized);
  }

  return allowedWorkers;
}

export function getAllowedWorkers(workingParty: WorkingPartyState): WorkingPartyMemberId[] {
  return WORKING_PARTY_MEMBER_IDS.filter((agentId) => workingParty[agentId]);
}

export function getNoctisExecutionMode(
  allowedWorkers: readonly WorkingPartyMemberId[]
): NoctisExecutionMode {
  return allowedWorkers.length > 0 ? "orchestrated" : "solo";
}

export function getNoctisAgentProfile(
  allowedWorkers: readonly WorkingPartyMemberId[]
): NoctisAgentProfile {
  return allowedWorkers.length > 0 ? "noctis" : "noctis-solo";
}

export function getWorkingPartySummary(allowedWorkers: readonly WorkingPartyMemberId[]): string {
  if (allowedWorkers.length === 0) {
    return "Noctis is traveling solo";
  }

  const names = allowedWorkers.map((agentId) => WORKING_PARTY_MEMBER_NAMES[agentId]);
  return `Current Party: ${names.join(", ")}`;
}

export function getCompactWorkingPartySummary(
  allowedWorkers: readonly WorkingPartyMemberId[]
): string {
  if (allowedWorkers.length === 0) {
    return "Traveling solo";
  }

  if (allowedWorkers.length === WORKING_PARTY_MEMBER_IDS.length) {
    return "Full party";
  }

  const names = allowedWorkers.map((agentId) => WORKING_PARTY_MEMBER_NAMES[agentId]);
  return `Party: ${names.join(", ")}`;
}

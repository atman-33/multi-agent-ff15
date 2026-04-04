import { getMission } from "@/lib/mission-store";
import type { StepDefinition } from "@/lib/operation-definition/types";
import type { WorkerAgentId } from "@/lib/types/mission";

export function hasDelegationPolicy(
  step: StepDefinition | null | undefined,
): step is StepDefinition & { delegation: NonNullable<StepDefinition["delegation"]> } {
  return Boolean(step?.delegation);
}

export function isAutonomousDelegationStep(
  step: StepDefinition | null | undefined,
): step is StepDefinition & { delegation: NonNullable<StepDefinition["delegation"]>; agent: "noctis" } {
  return Boolean(step && step.agent === "noctis" && step.rules.length === 0 && step.delegation);
}

export function resolveEffectiveDelegationWorkers(input: {
  missionId: string;
  step: StepDefinition;
}): WorkerAgentId[] {
  const authoredWorkers = input.step.delegation?.allowed_workers ?? [];
  const missionAllowedWorkers = getMission(input.missionId)?.allowedWorkers;
  const missionAllowedSet = Array.isArray(missionAllowedWorkers)
    ? new Set<WorkerAgentId>(missionAllowedWorkers)
    : null;

  return authoredWorkers.filter(
    (agentId, index) =>
      authoredWorkers.indexOf(agentId) === index &&
      (!missionAllowedSet || missionAllowedSet.has(agentId)),
  );
}
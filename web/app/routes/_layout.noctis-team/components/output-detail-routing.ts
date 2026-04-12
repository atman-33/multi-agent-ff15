import type { MissionOutputSummary } from "@/lib/types/mission";

export type MissionInspectorTab = "banter" | "activity" | "outputs";

export function buildMissionPath(missionId: string, routeBase = "/noctis-team"): string {
  return `${routeBase}/mission/${encodeURIComponent(missionId)}`;
}

export function buildMissionOutputDetailPath(
  missionId: string,
  output: Pick<MissionOutputSummary, "step" | "taskId" | "filename">,
  routeBase = "/noctis-team",
): string {
  return `${buildMissionPath(missionId, routeBase)}/output/${encodeURIComponent(output.step)}/${encodeURIComponent(output.taskId)}/${encodeURIComponent(output.filename)}`;
}

export function hasMissionOutputDetailRoute(input: {
  step?: string | null;
  taskId?: string | null;
  filename?: string | null;
}): boolean {
  return Boolean(input.step && input.taskId && input.filename);
}

export function resolveMissionInspectorTab(
  requestedTab: MissionInspectorTab,
  outputDetailActive: boolean,
): MissionInspectorTab {
  return outputDetailActive ? "outputs" : requestedTab;
}
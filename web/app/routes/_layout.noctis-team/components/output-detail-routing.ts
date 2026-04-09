import type { MissionOutputSummary } from "@/lib/types/mission";

export type NoctisInspectorTab = "banter" | "outputs";

export function buildMissionPath(missionId: string): string {
  return `/noctis-team/mission/${encodeURIComponent(missionId)}`;
}

export function buildMissionOutputDetailPath(
  missionId: string,
  output: Pick<MissionOutputSummary, "step" | "taskId" | "filename">,
): string {
  return `${buildMissionPath(missionId)}/output/${encodeURIComponent(output.step)}/${encodeURIComponent(output.taskId)}/${encodeURIComponent(output.filename)}`;
}

export function hasMissionOutputDetailRoute(input: {
  step?: string | null;
  taskId?: string | null;
  filename?: string | null;
}): boolean {
  return Boolean(input.step && input.taskId && input.filename);
}

export function resolveMissionInspectorTab(
  requestedTab: NoctisInspectorTab,
  outputDetailActive: boolean,
): NoctisInspectorTab {
  return outputDetailActive ? "outputs" : requestedTab;
}
import { buildMissionBanterTimeline } from "@/lib/banter/timeline";
import { getOpencodeClient } from "@/lib/opencode-client";
import { readSessionContextUsage } from "@/lib/session-context.server";
import type { SessionStatus } from "@/lib/session-status";
import { coerceSessionStatus } from "@/lib/session-status";
import type {
  AgentContextUsage,
  AgentId,
  BanterTimelineEntry,
  Mission,
} from "@/lib/types/mission";
import { buildMissionResumePayload } from "./mission-api.server";
import { getMissionPrimaryAgentId, getMissionPrimarySessionId } from "./mission-store";
import { getMissionSurfaceForMission } from "./mission-surface";

export type MissionSurfaceHydrationPayload = ReturnType<typeof buildMissionResumePayload> & {
  banterTimeline?: BanterTimelineEntry[];
  contextUsageByAgent: Partial<Record<AgentId, AgentContextUsage | null>>;
  sessionStatuses: Record<string, SessionStatus>;
};

function getRelevantContextUsageByAgent(
  mission: Mission,
  primaryAgentId: AgentId,
  primarySessionId: string | null,
): Partial<Record<AgentId, AgentContextUsage | null>> {
  if (primaryAgentId === "lunafreya") {
    return primarySessionId
      ? {
          lunafreya: readSessionContextUsage(primarySessionId),
        }
      : {
          lunafreya: null,
        };
  }

  const nextUsage: Partial<Record<AgentId, AgentContextUsage | null>> = {
    noctis: primarySessionId ? readSessionContextUsage(primarySessionId) : null,
  };

  if (mission.workerSessions.ignis) {
    nextUsage.ignis = readSessionContextUsage(mission.workerSessions.ignis);
  }

  if (mission.workerSessions.gladiolus) {
    nextUsage.gladiolus = readSessionContextUsage(mission.workerSessions.gladiolus);
  }

  if (mission.workerSessions.prompto) {
    nextUsage.prompto = readSessionContextUsage(mission.workerSessions.prompto);
  }

  return nextUsage;
}

function getRelevantSessionIds(mission: Mission, primaryAgentId: AgentId): string[] {
  const primarySessionId = getMissionPrimarySessionId(mission);
  const sessionIds: Array<string | null | undefined> = [primarySessionId];

  if (primaryAgentId !== "lunafreya") {
    sessionIds.push(
      mission.workerSessions.ignis,
      mission.workerSessions.gladiolus,
      mission.workerSessions.prompto,
    );
  }

  return sessionIds.filter((sessionId, index, values): sessionId is string => {
    return (
      typeof sessionId === "string" &&
      sessionId.length > 0 &&
      values.indexOf(sessionId) === index
    );
  });
}

function getRelevantSessionStatuses(
  rawStatuses: Record<string, unknown> | null | undefined,
  relevantSessionIds: string[],
): Record<string, SessionStatus> {
  const nextStatuses: Record<string, SessionStatus> = {};

  for (const sessionId of relevantSessionIds) {
    const status = coerceSessionStatus(rawStatuses?.[sessionId]);
    if (status) {
      nextStatuses[sessionId] = status;
    }
  }

  return nextStatuses;
}

export async function buildMissionSurfaceHydrationPayload(
  mission: Mission,
): Promise<MissionSurfaceHydrationPayload> {
  const primaryAgentId = getMissionPrimaryAgentId(mission) ?? "noctis";
  const primarySessionId = getMissionPrimarySessionId(mission);
  const surface = getMissionSurfaceForMission(mission);
  const client = getOpencodeClient();
  const statusResult = await client.session.status();

  if (statusResult.error) {
    throw new Error(String(statusResult.error));
  }

  const relevantSessionIds = getRelevantSessionIds(mission, primaryAgentId);

  return {
    ...buildMissionResumePayload(mission),
    ...(surface.supportsBanter
      ? {
          banterTimeline: buildMissionBanterTimeline(mission),
        }
      : {}),
    contextUsageByAgent: getRelevantContextUsageByAgent(
      mission,
      primaryAgentId,
      primarySessionId,
    ),
    sessionStatuses: getRelevantSessionStatuses(statusResult.data ?? {}, relevantSessionIds),
  };
}
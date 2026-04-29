import { buildMissionBanterTimeline } from "@/lib/banter/timeline";
import { getOpencodeClient } from "@/lib/opencode-client";
import type { MessageInfo } from "@/lib/opencode-session-types";
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
import {
  getMissionPrimaryAgentId,
  getMissionPrimarySessionId,
  updateMissionPrimaryMessageMetadata,
} from "./mission-store";
import { getMissionSurfaceForMission } from "./mission-surface";
import {
  listSessionStatusTargets,
  resolveSessionRouteTarget,
} from "./session-owner-routing.server";

export type MissionSurfaceHydrationPayload = ReturnType<typeof buildMissionResumePayload> & {
  banterTimeline?: BanterTimelineEntry[];
  contextUsageByAgent: Partial<Record<AgentId, AgentContextUsage | null>>;
  latestPrimaryMessageCreatedAt: string | null;
  latestPrimaryMessageId: string | null;
  sessionStatuses: Record<string, SessionStatus>;
};

function getLatestPrimaryMessageMetadata(messages: MessageInfo[] | null | undefined): {
  latestPrimaryMessageCreatedAt: string | null;
  latestPrimaryMessageId: string | null;
} {
  const latestMessage = Array.isArray(messages) && messages.length > 0 ? messages.at(-1) ?? null : null;
  const createdAt = latestMessage?.info.time.created;

  return {
    latestPrimaryMessageId: latestMessage?.info.id ?? null,
    latestPrimaryMessageCreatedAt:
      typeof createdAt === "number" ? new Date(createdAt).toISOString() : null,
  };
}

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

async function loadMissionSessionStatuses(): Promise<Record<string, unknown>> {
  const targets = listSessionStatusTargets();
  if (targets.length === 0) {
    const statusResult = await getOpencodeClient().session.status();
    if (statusResult.error) {
      throw new Error(String(statusResult.error));
    }

    return statusResult.data ?? {};
  }

  const statuses: Record<string, unknown> = {};
  let successCount = 0;

  for (const target of targets) {
    try {
      const result = await target.client.session.status();
      if (result.error) {
        continue;
      }

      Object.assign(statuses, result.data ?? {});
      successCount += 1;
    } catch {}
  }

  if (successCount === 0) {
    throw new Error("No OpenCode status endpoints responded.");
  }

  return statuses;
}

export async function buildMissionSurfaceHydrationPayload(
  mission: Mission,
): Promise<MissionSurfaceHydrationPayload> {
  const primaryAgentId = getMissionPrimaryAgentId(mission) ?? "noctis";
  const primarySessionId = getMissionPrimarySessionId(mission);
  const surface = getMissionSurfaceForMission(mission);
  const primarySessionClient = primarySessionId
    ? resolveSessionRouteTarget(primarySessionId).client
    : getOpencodeClient();
  const [rawStatuses, messagesResult] = await Promise.all([
    loadMissionSessionStatuses(),
    primarySessionId
      ? primarySessionClient.session.messages({ sessionID: primarySessionId })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const latestPrimaryMessage = messagesResult?.error
    ? {
        latestPrimaryMessageCreatedAt: null,
        latestPrimaryMessageId: null,
      }
    : getLatestPrimaryMessageMetadata((messagesResult?.data ?? []) as MessageInfo[]);
  updateMissionPrimaryMessageMetadata(mission.id, latestPrimaryMessage);

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
    latestPrimaryMessageCreatedAt: latestPrimaryMessage.latestPrimaryMessageCreatedAt,
    latestPrimaryMessageId: latestPrimaryMessage.latestPrimaryMessageId,
    sessionStatuses: getRelevantSessionStatuses(rawStatuses, relevantSessionIds),
  };
}
import { readAppLanguage } from "@/lib/app-language.server";
import { buildMissionBanterTimeline } from "@/lib/banter/timeline";
import { createBanterTemplate, createLiteralBanterTemplate } from "@/lib/banter/runtime";
import type { BanterCue, RecentBanterEntry } from "@/lib/banter/types";
import { appendAmbientBanter, getMission } from "@/lib/mission-store";
import type { AgentId, AmbientBanterEntry } from "@/lib/types/mission";

function buildRecentEntries(missionId: string): RecentBanterEntry[] {
  const mission = getMission(missionId);
  if (!mission) {
    return [];
  }

  return buildMissionBanterTimeline(mission)
    .slice(-5)
    .map((entry) => ({
      speakerId: entry.speakerAgent,
      message: entry.renderedMessage,
    }));
}

function shouldSkipRecentDuplicate(input: {
  missionId: string;
  speakerAgent: AgentId;
  cue: BanterCue;
  createdAt: string;
}): boolean {
  const mission = getMission(input.missionId);
  if (!mission) {
    return false;
  }

  const currentTime = new Date(input.createdAt).getTime();
  return mission.ambientBanterLog.slice(-5).some((entry) => {
    if (entry.speakerAgent !== input.speakerAgent || entry.cue !== input.cue) {
      return false;
    }

    return Math.abs(currentTime - new Date(entry.createdAt).getTime()) < 15_000;
  });
}

export function recordAmbientBanter(input: {
  missionId: string;
  speakerAgent: AgentId;
  cue: BanterCue;
  renderedMessage?: string;
  sourceEvent?: string;
  createdAt?: string;
}): AmbientBanterEntry | null {
  const createdAt = input.createdAt ?? new Date().toISOString();
  if (
    shouldSkipRecentDuplicate({
      missionId: input.missionId,
      speakerAgent: input.speakerAgent,
      cue: input.cue,
      createdAt,
    })
  ) {
    return null;
  }

  const language = readAppLanguage();
  const recentEntries = buildRecentEntries(input.missionId);
  const template = input.renderedMessage
    ? createLiteralBanterTemplate(input.speakerAgent, input.renderedMessage)
    : createBanterTemplate(input.speakerAgent, input.cue, { language, recentEntries });

  if (!template) {
    return null;
  }

  const entry: AmbientBanterEntry = {
    id: `banter_${crypto.randomUUID()}`,
    missionId: input.missionId,
    kind: "ambient",
    speakerAgent: template.speakerId as AgentId,
    cue: input.cue,
    renderedMessage: template.message,
    createdAt,
    ...(input.sourceEvent
      ? {
          payload: {
            sourceEvent: input.sourceEvent,
          },
        }
      : {}),
  };

  appendAmbientBanter(input.missionId, entry);
  return entry;
}
import { readAppLanguage } from "@/lib/app-language.server";
import { buildMissionBanterTimeline } from "@/lib/banter/timeline";
import { createBanterTemplate } from "@/lib/banter/runtime";
import type { BanterCue, RecentBanterEntry } from "@/lib/banter/types";
import { appendConversationLogEntry, getMission } from "@/lib/mission-store";
import type {
  AgentId,
  BanterEntryPayload,
  BanterTransport,
  ConversationLogEntry,
  ReportStatus,
} from "@/lib/types/mission";

const REPORT_CUES: Record<ReportStatus, BanterCue> = {
  running: "report-running",
  blocked: "report-blocked",
  completed: "report-completed",
  failed: "report-failed",
};

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

function buildEntryTimestamp(baseCreatedAt: string | undefined, index: number): string {
  const baseTime = baseCreatedAt ? new Date(baseCreatedAt).getTime() : Date.now();
  return new Date(baseTime + index).toISOString();
}

function appendConversationEntries(input: {
  missionId: string;
  fromAgent: AgentId;
  toAgent: AgentId;
  orchestratedBy: AgentId;
  taskId?: string;
  stepName?: string;
  createdAt?: string;
  payload?: BanterEntryPayload;
  transport?: BanterTransport;
  sequence: Array<{ speakerAgent: AgentId; cue: BanterCue }>;
}): ConversationLogEntry[] {
  const language = readAppLanguage();
  let recentEntries = buildRecentEntries(input.missionId);
  const appended: ConversationLogEntry[] = [];

  for (const [index, item] of input.sequence.entries()) {
    const template = createBanterTemplate(item.speakerAgent, item.cue, {
      language,
      recentEntries,
    });
    if (!template) {
      continue;
    }

    const entry: ConversationLogEntry = {
      id: `banter_${crypto.randomUUID()}`,
      missionId: input.missionId,
      kind: "directed",
      fromAgent: input.fromAgent,
      toAgent: input.toAgent,
      speakerAgent: template.speakerId as AgentId,
      orchestratedBy: input.orchestratedBy,
      cue: item.cue,
      renderedMessage: template.message,
      createdAt: buildEntryTimestamp(input.createdAt, index),
      ...(input.stepName ? { stepName: input.stepName } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.payload ? { payload: input.payload } : {}),
      ...(input.transport ? { transport: input.transport } : {}),
    };

    appendConversationLogEntry(input.missionId, entry);
    appended.push(entry);
    recentEntries = [...recentEntries, { speakerId: entry.speakerAgent, message: entry.renderedMessage }];
  }

  return appended;
}

export function recordDirectedTaskDelegation(input: {
  missionId: string;
  fromAgent: AgentId;
  toAgent: AgentId;
  orchestratedBy: AgentId;
  taskId?: string;
  stepName?: string;
  createdAt?: string;
  canonicalMessage?: string;
  transport?: BanterTransport;
}): ConversationLogEntry[] {
  return appendConversationEntries({
    missionId: input.missionId,
    fromAgent: input.fromAgent,
    toAgent: input.toAgent,
    orchestratedBy: input.orchestratedBy,
    taskId: input.taskId,
    stepName: input.stepName,
    createdAt: input.createdAt,
    payload: {
      canonicalMessage: input.canonicalMessage,
      taskId: input.taskId,
      stepName: input.stepName,
    },
    transport: input.transport,
    sequence: [
      { speakerAgent: input.fromAgent, cue: "task-delegated" },
      { speakerAgent: input.toAgent, cue: "message-received" },
    ],
  });
}

export function recordDirectedReportReturn(input: {
  missionId: string;
  fromAgent: AgentId;
  toAgent: AgentId;
  orchestratedBy: AgentId;
  taskId: string;
  next?: string;
  reportStatus: ReportStatus;
  reportBody: string;
  createdAt?: string;
  transport?: BanterTransport;
}): ConversationLogEntry[] {
  const sequence: Array<{ speakerAgent: AgentId; cue: BanterCue }> = [
    { speakerAgent: input.fromAgent, cue: REPORT_CUES[input.reportStatus] },
  ];

  if (input.toAgent === "noctis" && input.reportStatus === "completed") {
    sequence.push({ speakerAgent: "noctis", cue: "report-acknowledged" });
  }

  return appendConversationEntries({
    missionId: input.missionId,
    fromAgent: input.fromAgent,
    toAgent: input.toAgent,
    orchestratedBy: input.orchestratedBy,
    taskId: input.taskId,
    createdAt: input.createdAt,
    payload: {
      reportBody: input.reportBody,
      reportStatus: input.reportStatus,
      next: input.next,
      taskId: input.taskId,
    },
    transport: input.transport,
    sequence,
  });
}

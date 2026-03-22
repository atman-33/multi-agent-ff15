import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";
import type {
  ActivityActorId,
  AgentId,
  DelegationLedger,
  Mission,
  MissionActivityKind,
  MissionActivityLogEntry,
  MissionMessageLogEntry,
  MissionStatus,
  MissionSummary,
  ModelSelection,
  Task,
  TaskStatus,
  WorkerResult,
  WorkerAgentId,
} from "./types/mission";

const store = new Map<string, Mission>();

function getMissionStoreDir(): string {
  return join(getProjectRoot(), "runtime", "noctis-missions");
}

function getMissionFilePath(id: string): string {
  return join(getMissionStoreDir(), `${id}.json`);
}

function ensureMissionStoreDir(): void {
  const dir = getMissionStoreDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function persistMission(mission: Mission): void {
  ensureMissionStoreDir();
  writeFileSync(getMissionFilePath(mission.id), JSON.stringify(mission, null, 2), "utf-8");
}

function readMissionFromDisk(id: string): Mission | null {
  const filePath = getMissionFilePath(id);
  if (!existsSync(filePath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Mission;
    parsed.messageLog = Array.isArray(parsed.messageLog) ? parsed.messageLog : [];
    parsed.activityLog = Array.isArray(parsed.activityLog) ? parsed.activityLog : [];
    return parsed;
  } catch {
    return null;
  }
}

function toMissionSummary(mission: Mission): MissionSummary {
  return {
    missionId: mission.id,
    title: mission.title,
    objective: mission.objective,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
    status: mission.status,
  };
}

function touchMission(mission: Mission, status?: MissionStatus): void {
  mission.updatedAt = new Date().toISOString();
  if (status) {
    mission.status = status;
  }
  persistMission(mission);
}

export function createMission(
  id: string,
  noctisSessionId: string,
  options?: { title?: string; objective?: string }
): Mission {
  const now = new Date().toISOString();
  const mission: Mission = {
    id,
    noctisSessionId,
    workerSessions: {},
    taskGraph: [],
    delegationLedger: {
      missionId: id,
      activeTasks: [],
      completedSummaries: {},
    },
    agentModels: {},
    createdAt: now,
    updatedAt: now,
    title: options?.title?.trim() || `Mission ${now}`,
    objective: options?.objective?.trim() || undefined,
    status: "active",
    messageLog: [],
    activityLog: [],
  };
  store.set(id, mission);
  persistMission(mission);
  return mission;
}

export function getMission(id: string): Mission | undefined {
  const inMemory = store.get(id);
  if (inMemory) {
    return inMemory;
  }

  const fromDisk = readMissionFromDisk(id);
  if (fromDisk) {
    store.set(id, fromDisk);
    return fromDisk;
  }

  return undefined;
}

export function listMissionSummaries(): MissionSummary[] {
  ensureMissionStoreDir();
  const dir = getMissionStoreDir();
  if (!existsSync(dir)) {
    return [];
  }

  const filenames = readdirSync(dir).filter((name) => name.endsWith(".json"));
  const missions = filenames
    .map((filename) => readMissionFromDisk(filename.replace(/\.json$/, "")))
    .filter((mission): mission is Mission => mission !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return missions.map(toMissionSummary);
}

export function setWorkerSession(
  missionId: string,
  agentId: WorkerAgentId,
  sessionId: string
): void {
  const mission = getMission(missionId);
  if (!mission) return;
  mission.workerSessions[agentId] = sessionId;
  touchMission(mission);
}

export function setAgentModels(
  missionId: string,
  agentModels: Partial<Record<AgentId, ModelSelection>>
): void {
  const mission = getMission(missionId);
  if (!mission) return;
  mission.agentModels = { ...mission.agentModels, ...agentModels };
  touchMission(mission);
}

export function addTask(missionId: string, task: Task): void {
  const mission = getMission(missionId);
  if (!mission) return;
  mission.taskGraph.push(task);
  mission.delegationLedger.activeTasks.push({
    id: task.id,
    assignedTo: task.assignedTo,
    status: task.status,
  });
  touchMission(mission);
}

export function updateTask(
  missionId: string,
  taskId: string,
  status: TaskStatus,
  summary?: string,
  result?: WorkerResult
): void {
  const mission = getMission(missionId);
  if (!mission) return;

  const task = mission.taskGraph.find((t) => t.id === taskId);
  if (task) {
    task.status = status;
    if (result) {
      task.result = result;
    }
  }

  const ledgerEntry = mission.delegationLedger.activeTasks.find((t) => t.id === taskId);
  if (ledgerEntry) {
    ledgerEntry.status = status;
  }

  const assignedTo = task?.assignedTo ?? ledgerEntry?.assignedTo;
  if (assignedTo && (status === "completed" || status === "failed" || status === "blocked")) {
    for (const existingTask of mission.taskGraph) {
      if (
        existingTask.id !== taskId &&
        existingTask.assignedTo === assignedTo &&
        (existingTask.status === "pending" || existingTask.status === "running")
      ) {
        existingTask.status = status;
      }
    }

    for (const existingLedgerEntry of mission.delegationLedger.activeTasks) {
      if (
        existingLedgerEntry.id !== taskId &&
        existingLedgerEntry.assignedTo === assignedTo &&
        (existingLedgerEntry.status === "pending" || existingLedgerEntry.status === "running")
      ) {
        existingLedgerEntry.status = status;
      }
    }
  }

  if ((status === "completed" || status === "failed" || status === "blocked") && summary) {
    mission.delegationLedger.completedSummaries[taskId] = summary;
  }

  touchMission(
    mission,
    status === "running" || status === "pending" || status === "blocked" ? "active" : undefined
  );
}

export function updateMissionMetadata(
  missionId: string,
  patch: Partial<Pick<Mission, "title" | "objective" | "status">>
): void {
  const mission = getMission(missionId);
  if (!mission) return;

  if (typeof patch.title === "string" && patch.title.trim()) {
    mission.title = patch.title.trim();
  }
  if (typeof patch.objective === "string") {
    mission.objective = patch.objective.trim() || undefined;
  }
  touchMission(mission, patch.status);
}

export function appendMissionMessage(missionId: string, message: MissionMessageLogEntry): void {
  const mission = getMission(missionId);
  if (!mission) return;
  mission.messageLog.push(message);
  touchMission(mission);
}

export function appendMissionActivity(
  missionId: string,
  activity: {
    id: string;
    actor: ActivityActorId;
    speaker: ActivityActorId;
    kind: MissionActivityKind;
    body: string;
    createdAt?: string;
    source?: MissionActivityLogEntry["source"];
  }
): void {
  const mission = getMission(missionId);
  if (!mission) return;

  const entry: MissionActivityLogEntry = {
    id: activity.id,
    missionId,
    actor: activity.actor,
    speaker: activity.speaker,
    kind: activity.kind,
    body: activity.body,
    createdAt: activity.createdAt ?? new Date().toISOString(),
    source: activity.source,
  };

  mission.activityLog.push(entry);
  touchMission(mission);
}

export function buildDelegationLedger(mission: Mission): string {
  const ledger: DelegationLedger = mission.delegationLedger;
  return JSON.stringify(ledger, null, 2);
}

export function deleteMission(id: string): void {
  store.delete(id);
}

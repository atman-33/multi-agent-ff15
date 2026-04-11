import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeContextProjectIds,
  normalizeExecutionProjectId,
} from "@/lib/execution-context";
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
  OperationState,
  Task,
  TaskStatus,
  WorkerAgentId,
  WorkerResult,
} from "./types/mission";

const store = new Map<string, Mission>();
const MISSION_WORKSPACE_STATUSES = new Set(["ready", "missing", "deleted"]);

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function getMissionStoreDir(): string {
  return join(getProjectRoot(), "runtime", "noctis-missions");
}

export function getMissionDir(id: string): string {
  return join(getMissionStoreDir(), id);
}

export function getMissionFilePath(id: string): string {
  return join(getMissionDir(id), "mission.json");
}

export function getMissionOutputsDir(id: string): string {
  return join(getMissionDir(id), "outputs");
}

export function getMissionTaskOutputDir(missionId: string, step: string, taskId: string): string {
  return join(getMissionOutputsDir(missionId), step, taskId);
}

export function getMissionOutputFilePath(
  missionId: string,
  step: string,
  taskId: string,
  filename: string,
): string {
  return join(getMissionTaskOutputDir(missionId, step, taskId), filename);
}

function ensureMissionStoreDir(): void {
  const dir = getMissionStoreDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function ensureMissionDir(id: string): void {
  ensureMissionStoreDir();
  const dir = getMissionDir(id);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function persistMissionToDisk(mission: Mission): void {
  ensureMissionDir(mission.id);
  writeFileSync(getMissionFilePath(mission.id), JSON.stringify(mission, null, 2), "utf-8");
}

function readMissionFromDisk(id: string): Mission | null {
  const filePath = getMissionFilePath(id);
  if (!existsSync(filePath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Mission;
    parsed.executionProjectId = normalizeExecutionProjectId(parsed.executionProjectId);
    parsed.contextProjectIds = normalizeContextProjectIds(
      parsed.executionProjectId,
      parsed.contextProjectIds,
    );
    parsed.baseBranch = normalizeOptionalString(parsed.baseBranch);
    parsed.branch = normalizeOptionalString(parsed.branch);
    parsed.workspacePath = normalizeOptionalString(parsed.workspacePath);
    parsed.workspaceStatus = MISSION_WORKSPACE_STATUSES.has(String(parsed.workspaceStatus))
      ? parsed.workspaceStatus
      : undefined;
    parsed.messageLog = Array.isArray(parsed.messageLog) ? parsed.messageLog : [];
    parsed.activityLog = Array.isArray(parsed.activityLog) ? parsed.activityLog : [];
    parsed.allowedWorkers = Array.isArray(parsed.allowedWorkers)
      ? parsed.allowedWorkers.filter(
          (item): item is WorkerAgentId =>
            item === "ignis" || item === "gladiolus" || item === "prompto",
        )
      : [];
    parsed.archivedAt = typeof parsed.archivedAt === "string" ? parsed.archivedAt : undefined;
    if (parsed.operationState && "previousResponse" in parsed.operationState) {
      delete (parsed.operationState as { previousResponse?: string | null }).previousResponse;
    }
    if (parsed.operationState) {
      const operationState = parsed.operationState as OperationState & {
        delegatedTasks?: unknown;
      };
      operationState.delegatedTasks = Array.isArray(operationState.delegatedTasks)
        ? operationState.delegatedTasks
            .filter(
              (item): item is NonNullable<OperationState["delegatedTasks"]>[number] =>
                !!item &&
                typeof item === "object" &&
                typeof (item as { parentStep?: unknown }).parentStep === "string" &&
                typeof (item as { taskId?: unknown }).taskId === "string" &&
                ((item as { agent?: unknown }).agent === "ignis" ||
                  (item as { agent?: unknown }).agent === "gladiolus" ||
                  (item as { agent?: unknown }).agent === "prompto") &&
                ((item as { status?: unknown }).status === "dispatched" ||
                  (item as { status?: unknown }).status === "completed" ||
                  (item as { status?: unknown }).status === "failed") &&
                typeof (item as { createdAt?: unknown }).createdAt === "string",
            )
            .map((item) => ({
              parentStep: item.parentStep,
              taskId: item.taskId,
              agent: item.agent,
              status: item.status,
              createdAt: item.createdAt,
              completedAt: typeof item.completedAt === "string" ? item.completedAt : undefined,
              message: typeof item.message === "string" ? item.message : undefined,
              summary: typeof item.summary === "string" ? item.summary : undefined,
            }))
        : [];
    }
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
    archivedAt: mission.archivedAt,
    status: mission.status,
  };
}

function touchMission(mission: Mission, status?: MissionStatus): void {
  mission.updatedAt = new Date().toISOString();
  if (status) {
    mission.status = status;
  }
  persistMissionToDisk(mission);
}

export function createMission(
  id: string,
  noctisSessionId: string,
  options?: {
    title?: string;
    objective?: string;
    allowedWorkers?: WorkerAgentId[];
    executionProjectId?: string;
    contextProjectIds?: string[];
    baseBranch?: string;
    branch?: string;
    workspacePath?: string;
    workspaceStatus?: Mission["workspaceStatus"];
  }
): Mission {
  const now = new Date().toISOString();
  const executionProjectId = normalizeExecutionProjectId(options?.executionProjectId);
  const mission: Mission = {
    id,
    noctisSessionId,
    workerSessions: {},
    executionProjectId,
    contextProjectIds: normalizeContextProjectIds(executionProjectId, options?.contextProjectIds),
    ...(options?.baseBranch ? { baseBranch: options.baseBranch.trim() } : {}),
    ...(options?.branch ? { branch: options.branch.trim() } : {}),
    ...(options?.workspacePath ? { workspacePath: options.workspacePath.trim() } : {}),
    ...(options?.workspaceStatus ? { workspaceStatus: options.workspaceStatus } : {}),
    allowedWorkers: options?.allowedWorkers ?? [],
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
  persistMissionToDisk(mission);
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

export function listMissionSummaries(options?: { view?: "active" | "archived" | "all" }): MissionSummary[] {
  ensureMissionStoreDir();
  const dir = getMissionStoreDir();
  if (!existsSync(dir)) {
    return [];
  }

  const view = options?.view ?? "active";

  const missionIds = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const missions = missionIds
    .map((missionId) => readMissionFromDisk(missionId))
    .filter((mission): mission is Mission => mission !== null)
    .filter((mission) => {
      if (view === "all") {
        return true;
      }

      const isArchived = mission.status === "archived";
      return view === "archived" ? isArchived : !isArchived;
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return missions.map(toMissionSummary);
}

export function archiveMission(missionId: string): Mission | undefined {
  const mission = getMission(missionId);
  if (!mission) {
    return undefined;
  }

  mission.archivedAt = new Date().toISOString();
  touchMission(mission, "archived");
  return mission;
}

export function restoreMission(missionId: string): Mission | undefined {
  const mission = getMission(missionId);
  if (!mission) {
    return undefined;
  }

  delete mission.archivedAt;
  touchMission(mission, "active");
  return mission;
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

export function setNoctisSession(missionId: string, sessionId: string): void {
  const mission = getMission(missionId);
  if (!mission) return;
  mission.noctisSessionId = sessionId.trim();
  touchMission(mission);
}

export function clearMissionSessions(missionId: string): void {
  const mission = getMission(missionId);
  if (!mission) return;
  mission.noctisSessionId = "";
  mission.workerSessions = {};
  touchMission(mission);
}

export function updateMissionExecutionContext(
  missionId: string,
  patch: Partial<
    Pick<
      Mission,
      | "executionProjectId"
      | "contextProjectIds"
      | "baseBranch"
      | "branch"
      | "workspacePath"
      | "workspaceStatus"
    >
  >,
): void {
  const mission = getMission(missionId);
  if (!mission) return;

  if ("executionProjectId" in patch) {
    const nextExecutionProjectId = normalizeExecutionProjectId(patch.executionProjectId);
    if (
      mission.executionProjectId &&
      nextExecutionProjectId &&
      mission.executionProjectId !== nextExecutionProjectId
    ) {
      throw new Error("Execution project cannot be changed after mission creation.");
    }
    mission.executionProjectId = nextExecutionProjectId;
  }

  if ("contextProjectIds" in patch) {
    mission.contextProjectIds = normalizeContextProjectIds(
      mission.executionProjectId,
      patch.contextProjectIds,
    );
  }

  if ("baseBranch" in patch) {
    mission.baseBranch = normalizeOptionalString(patch.baseBranch);
  }

  if ("branch" in patch) {
    mission.branch = normalizeOptionalString(patch.branch);
  }

  if ("workspacePath" in patch) {
    mission.workspacePath = normalizeOptionalString(patch.workspacePath);
  }

  if ("workspaceStatus" in patch) {
    mission.workspaceStatus = MISSION_WORKSPACE_STATUSES.has(String(patch.workspaceStatus))
      ? patch.workspaceStatus
      : undefined;
  }

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

export function setAllowedWorkers(missionId: string, allowedWorkers: WorkerAgentId[]): void {
  const mission = getMission(missionId);
  if (!mission) return;
  mission.allowedWorkers = [...allowedWorkers];
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

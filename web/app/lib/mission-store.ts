import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeContextProjectIds,
  normalizeExecutionProjectId,
} from "@/lib/execution-context";
import { getProjectRoot } from "@/lib/get-project-root.server";
import {
  buildCurrentMissionRuntimeMetadata,
  normalizeMissionSchemaVersion,
  normalizeMissionTransportMode,
} from "@/lib/mission-runtime-compatibility.server";
import type {
  AmbientBanterEntry,
  ActivityActorId,
  AgentId,
  ConversationLogEntry,
  DelegationLedger,
  LunafreyaFacetSelection,
  MissionOutputMetadata,
  Mission,
  MissionExecutionTargetMode,
  MissionActivityKind,
  MissionActivityLogEntry,
  MissionMessageLogEntry,
  MissionPrimaryAgentId,
  MissionStatus,
  MissionSurfaceId,
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

function normalizeExecutionTargetMode(
  value: unknown,
  executionProjectId?: string,
): MissionExecutionTargetMode | undefined {
  if (value === "mission_workspace" || value === "execution_project") {
    return value;
  }

  return executionProjectId ? "mission_workspace" : undefined;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeMissionSessionOwners(value: unknown): Record<string, AgentId> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const normalizedOwners: Record<string, AgentId> = {};
  for (const [sessionId, ownerAgent] of Object.entries(value as Record<string, unknown>)) {
    const normalizedSessionId = normalizeOptionalString(sessionId);
    if (!normalizedSessionId) {
      continue;
    }

    if (
      ownerAgent !== "noctis" &&
      ownerAgent !== "lunafreya" &&
      ownerAgent !== "ignis" &&
      ownerAgent !== "gladiolus" &&
      ownerAgent !== "prompto"
    ) {
      continue;
    }

    normalizedOwners[normalizedSessionId] = ownerAgent;
  }

  return normalizedOwners;
}

function setMissionSessionOwner(
  mission: Mission,
  sessionId: string,
  ownerAgent: AgentId,
  previousSessionId?: string | null,
): void {
  const normalizedSessionId = normalizeOptionalString(sessionId);
  if (!normalizedSessionId) {
    return;
  }

  const normalizedPreviousSessionId = normalizeOptionalString(previousSessionId);
  const sessionOwners = mission.sessionOwners ?? {};
  if (normalizedPreviousSessionId && normalizedPreviousSessionId !== normalizedSessionId) {
    delete sessionOwners[normalizedPreviousSessionId];
  }

  sessionOwners[normalizedSessionId] = ownerAgent;
  mission.sessionOwners = sessionOwners;
}

function normalizeMissionSurfaceId(value: unknown): MissionSurfaceId | undefined {
  return value === "lunafreya" || value === "noctis_team" ? value : undefined;
}

function normalizeMissionPrimaryAgentId(value: unknown): MissionPrimaryAgentId | undefined {
  return value === "lunafreya" || value === "noctis" ? value : undefined;
}

function normalizeLunafreyaFacetSelection(value: unknown): LunafreyaFacetSelection | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const selectedSkillIds = Array.isArray(record.selectedSkillIds)
    ? record.selectedSkillIds.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      )
    : [];
  const updatedAt = normalizeOptionalString(record.updatedAt);

  if (!updatedAt) {
    return undefined;
  }

  const selectedJobId = normalizeOptionalString(record.selectedJobId);

  return {
    ...(selectedJobId ? { selectedJobId } : {}),
    selectedSkillIds,
    updatedAt,
  };
}

function normalizeLunafreyaFacetSnapshot(
  value: unknown,
): MissionOutputMetadata["lunafreyaFacetSnapshot"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const selection = normalizeLunafreyaFacetSelection(record);
  if (!selection) {
    return undefined;
  }

  const selectedJobLabel =
    typeof record.selectedJobLabel === "string" && record.selectedJobLabel.trim().length > 0
      ? record.selectedJobLabel.trim()
      : null;
  const selectedSkillLabels = Array.isArray(record.selectedSkillLabels)
    ? record.selectedSkillLabels.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      )
    : [];

  return {
    ...selection,
    ...(selectedJobLabel ? { selectedJobLabel } : {}),
    selectedSkillLabels,
  };
}

function normalizeMissionOutputMetadata(value: unknown): MissionOutputMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const capturedAt = normalizeOptionalString(record.capturedAt);
  if (!capturedAt) {
    return undefined;
  }

  const lunafreyaFacetSnapshot = normalizeLunafreyaFacetSnapshot(record.lunafreyaFacetSnapshot);

  return {
    capturedAt,
    ...(lunafreyaFacetSnapshot ? { lunafreyaFacetSnapshot } : {}),
  };
}

function normalizeMissionOutputMetadataByKey(
  value: unknown,
): Record<string, MissionOutputMetadata> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, entryValue]) => {
      const normalized = normalizeMissionOutputMetadata(entryValue);
      return normalized ? ([key, normalized] as const) : null;
    })
    .filter((entry): entry is readonly [string, MissionOutputMetadata] => entry !== null);

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

export function getMissionSurfaceId(mission: Mission | null | undefined): MissionSurfaceId | null {
  if (!mission) {
    return null;
  }

  if (mission.surfaceId) {
    return mission.surfaceId;
  }

  return mission.primaryAgentId === "lunafreya" ? "lunafreya" : "noctis_team";
}

export function getMissionPrimaryAgentId(
  mission: Mission | null | undefined,
): MissionPrimaryAgentId | null {
  if (!mission) {
    return null;
  }

  return mission.primaryAgentId ?? (getMissionSurfaceId(mission) === "lunafreya" ? "lunafreya" : "noctis");
}

export function getMissionPrimarySessionId(mission: Mission | null | undefined): string | null {
  if (!mission) {
    return null;
  }

  const primarySessionId = normalizeOptionalString(mission.primarySessionId);
  if (primarySessionId) {
    return primarySessionId;
  }

  const noctisSessionId = normalizeOptionalString(mission.noctisSessionId);
  return noctisSessionId ?? null;
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

export function buildMissionOutputMetadataKey(input: {
  step: string;
  taskId: string;
  filename: string;
}): string {
  return `${input.step}::${input.taskId}::${input.filename}`;
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
    parsed.executionTargetMode = normalizeExecutionTargetMode(
      parsed.executionTargetMode,
      parsed.executionProjectId,
    );
    parsed.transportMode = normalizeMissionTransportMode(parsed.transportMode);
    parsed.schemaVersion = normalizeMissionSchemaVersion(parsed.schemaVersion);
    parsed.surfaceId = normalizeMissionSurfaceId(parsed.surfaceId);
    parsed.primaryAgentId = normalizeMissionPrimaryAgentId(parsed.primaryAgentId);
    parsed.primarySessionId = normalizeOptionalString(parsed.primarySessionId);
    parsed.sessionOwners = normalizeMissionSessionOwners(parsed.sessionOwners);
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
    parsed.conversationLog = Array.isArray(parsed.conversationLog) ? parsed.conversationLog : [];
    parsed.ambientBanterLog = Array.isArray(parsed.ambientBanterLog) ? parsed.ambientBanterLog : [];
    parsed.messageLog = Array.isArray(parsed.messageLog) ? parsed.messageLog : [];
    parsed.activityLog = Array.isArray(parsed.activityLog) ? parsed.activityLog : [];
    parsed.lunafreyaFacetSelection = normalizeLunafreyaFacetSelection(
      parsed.lunafreyaFacetSelection,
    );
    parsed.outputMetadataByKey = normalizeMissionOutputMetadataByKey(parsed.outputMetadataByKey);
    parsed.allowedWorkers = Array.isArray(parsed.allowedWorkers)
      ? parsed.allowedWorkers.filter(
          (item): item is WorkerAgentId =>
            item === "ignis" || item === "gladiolus" || item === "prompto",
        )
      : [];
    parsed.latestPrimaryMessageId = normalizeOptionalString(parsed.latestPrimaryMessageId);
    parsed.latestPrimaryMessageCreatedAt = normalizeOptionalString(
      parsed.latestPrimaryMessageCreatedAt,
    );
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
  const activitySessionIds = [
    getMissionPrimarySessionId(mission),
    mission.workerSessions.ignis,
    mission.workerSessions.gladiolus,
    mission.workerSessions.prompto,
  ].filter((sessionId, index, values): sessionId is string => {
    return (
      typeof sessionId === "string" && sessionId.length > 0 && values.indexOf(sessionId) === index
    );
  });

  return {
    missionId: mission.id,
    title: mission.title,
    objective: mission.objective,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
    archivedAt: mission.archivedAt,
    status: mission.status,
    activitySessionIds,
    primarySessionId: getMissionPrimarySessionId(mission),
    latestPrimaryMessageId: mission.latestPrimaryMessageId ?? null,
    latestPrimaryMessageCreatedAt: mission.latestPrimaryMessageCreatedAt ?? null,
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
    surfaceId?: MissionSurfaceId;
    primaryAgentId?: MissionPrimaryAgentId;
    lunafreyaFacetSelection?: LunafreyaFacetSelection;
    allowedWorkers?: WorkerAgentId[];
    executionProjectId?: string;
    executionTargetMode?: MissionExecutionTargetMode;
    contextProjectIds?: string[];
    baseBranch?: string;
    branch?: string;
    workspacePath?: string;
    workspaceStatus?: Mission["workspaceStatus"];
  }
): Mission {
  const now = new Date().toISOString();
  const executionProjectId = normalizeExecutionProjectId(options?.executionProjectId);
  const executionTargetMode = normalizeExecutionTargetMode(
    options?.executionTargetMode,
    executionProjectId,
  );
  const normalizedPrimarySessionId = noctisSessionId.trim();
  const primaryAgentId = options?.primaryAgentId ?? "noctis";
  const surfaceId = options?.surfaceId ?? (primaryAgentId === "lunafreya" ? "lunafreya" : "noctis_team");
  const mission: Mission = {
    id,
    ...buildCurrentMissionRuntimeMetadata(),
    noctisSessionId: primaryAgentId === "noctis" ? normalizedPrimarySessionId : "",
    surfaceId,
    primaryAgentId,
    primarySessionId: normalizedPrimarySessionId,
    sessionOwners: normalizedPrimarySessionId
      ? { [normalizedPrimarySessionId]: primaryAgentId }
      : {},
    workerSessions: {},
    executionProjectId,
    ...(executionTargetMode ? { executionTargetMode } : {}),
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
    conversationLog: [],
    ambientBanterLog: [],
    messageLog: [],
    activityLog: [],
    ...(options?.lunafreyaFacetSelection
      ? { lunafreyaFacetSelection: options.lunafreyaFacetSelection }
      : {}),
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

export function listMissionSummaries(options?: {
  view?: "active" | "archived" | "all";
  surfaceId?: MissionSurfaceId;
}): MissionSummary[] {
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
    .map((missionId) => getMission(missionId))
    .filter((mission): mission is Mission => mission !== null)
    .filter((mission) => {
      if (view === "all") {
        return true;
      }

      const isArchived = mission.status === "archived";
      return view === "archived" ? isArchived : !isArchived;
    })
    .filter((mission) => {
      if (!options?.surfaceId) {
        return true;
      }

      return getMissionSurfaceId(mission) === options.surfaceId;
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return missions.map(toMissionSummary);
}

export function listMissionSummariesWithCounts(options?: {
  view?: "active" | "archived" | "all";
  surfaceId?: MissionSurfaceId;
}): {
  missions: MissionSummary[];
  counts: { active: number; archived: number };
} {
  const allMissions = listMissionSummaries({ view: "all", surfaceId: options?.surfaceId });
  const counts = allMissions.reduce(
    (result, mission) => {
      if (mission.status === "archived") {
        result.archived += 1;
      } else {
        result.active += 1;
      }

      return result;
    },
    { active: 0, archived: 0 },
  );
  const view = options?.view ?? "active";

  return {
    counts,
    missions:
      view === "all"
        ? allMissions
        : allMissions.filter((mission) =>
            view === "archived" ? mission.status === "archived" : mission.status !== "archived",
          ),
  };
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
  const previousSessionId = mission.workerSessions[agentId];
  mission.workerSessions[agentId] = sessionId;
  setMissionSessionOwner(mission, sessionId, agentId, previousSessionId);
  touchMission(mission);
}

export function setNoctisSession(missionId: string, sessionId: string): void {
  setMissionPrimarySession(missionId, "noctis", sessionId);
}

export function setMissionPrimarySession(
  missionId: string,
  agentId: MissionPrimaryAgentId,
  sessionId: string,
): void {
  const mission = getMission(missionId);
  if (!mission) return;
  const normalizedSessionId = sessionId.trim();
  const previousSessionId =
    agentId === "noctis"
      ? normalizeOptionalString(mission.noctisSessionId)
      : getMissionPrimaryAgentId(mission) === agentId
        ? getMissionPrimarySessionId(mission)
        : null;
  if (agentId === "noctis") {
    mission.noctisSessionId = normalizedSessionId;
  }
  if (getMissionPrimaryAgentId(mission) === agentId) {
    if (mission.primarySessionId !== normalizedSessionId) {
      mission.latestPrimaryMessageId = undefined;
      mission.latestPrimaryMessageCreatedAt = undefined;
    }
    mission.primarySessionId = normalizedSessionId;
  }
  setMissionSessionOwner(mission, normalizedSessionId, agentId, previousSessionId);
  touchMission(mission);
}

export function setLunafreyaFacetSelection(
  missionId: string,
  selection: Omit<LunafreyaFacetSelection, "updatedAt"> & { updatedAt?: string },
): void {
  const mission = getMission(missionId);
  if (!mission) return;
  mission.lunafreyaFacetSelection = normalizeLunafreyaFacetSelection({
    ...selection,
    updatedAt: selection.updatedAt ?? new Date().toISOString(),
  });
  touchMission(mission);
}

export function getMissionOutputMetadata(
  mission: Mission | null | undefined,
  input: {
    step: string;
    taskId: string;
    filename: string;
  },
): MissionOutputMetadata | null {
  if (!mission?.outputMetadataByKey) {
    return null;
  }

  const key = buildMissionOutputMetadataKey(input);
  return mission.outputMetadataByKey[key] ?? null;
}

export function setMissionOutputMetadata(
  missionId: string,
  input: {
    step: string;
    taskId: string;
    filename: string;
    metadata: MissionOutputMetadata;
  },
): void {
  const mission = getMission(missionId);
  if (!mission) return;

  const key = buildMissionOutputMetadataKey(input);
  mission.outputMetadataByKey = {
    ...(mission.outputMetadataByKey ?? {}),
    [key]: input.metadata,
  };
  touchMission(mission);
}

export function clearMissionSessions(missionId: string): void {
  const mission = getMission(missionId);
  if (!mission) return;
  mission.noctisSessionId = "";
  mission.primarySessionId = "";
  mission.sessionOwners = {};
  mission.workerSessions = {};
  touchMission(mission);
}

export function updateMissionExecutionContext(
  missionId: string,
  patch: Partial<
    Pick<
      Mission,
      | "executionProjectId"
      | "executionTargetMode"
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
    mission.executionTargetMode = normalizeExecutionTargetMode(
      mission.executionTargetMode,
      mission.executionProjectId,
    );
  }

  if ("executionTargetMode" in patch) {
    const nextExecutionTargetMode = normalizeExecutionTargetMode(
      patch.executionTargetMode,
      mission.executionProjectId,
    );
    if (
      mission.executionTargetMode &&
      nextExecutionTargetMode &&
      mission.executionTargetMode !== nextExecutionTargetMode
    ) {
      throw new Error("Execution target mode cannot be changed after mission creation.");
    }
    mission.executionTargetMode = nextExecutionTargetMode;
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

export function updateMissionPrimaryMessageMetadata(
  missionId: string,
  metadata: {
    latestPrimaryMessageId: string | null;
    latestPrimaryMessageCreatedAt: string | null;
  },
): void {
  const mission = getMission(missionId);
  if (!mission) return;

  const nextMessageId = normalizeOptionalString(metadata.latestPrimaryMessageId);
  const nextCreatedAt = normalizeOptionalString(metadata.latestPrimaryMessageCreatedAt);
  const currentMessageId = normalizeOptionalString(mission.latestPrimaryMessageId);
  const currentCreatedAt = normalizeOptionalString(mission.latestPrimaryMessageCreatedAt);

  if (currentMessageId === nextMessageId && currentCreatedAt === nextCreatedAt) {
    return;
  }

  mission.latestPrimaryMessageId = nextMessageId;
  mission.latestPrimaryMessageCreatedAt = nextCreatedAt;
  touchMission(mission);
}

export function appendMissionMessage(missionId: string, message: MissionMessageLogEntry): void {
  const mission = getMission(missionId);
  if (!mission) return;
  mission.messageLog.push(message);
  touchMission(mission);
}

export function appendConversationLogEntry(missionId: string, entry: ConversationLogEntry): void {
  const mission = getMission(missionId);
  if (!mission) return;
  mission.conversationLog.push(entry);
  touchMission(mission);
}

export function appendAmbientBanter(missionId: string, entry: AmbientBanterEntry): void {
  const mission = getMission(missionId);
  if (!mission) return;
  mission.ambientBanterLog.push(entry);
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

import type { Mission, Task, DelegationLedger, WorkerAgentId, TaskStatus } from "./types/mission";

const store = new Map<string, Mission>();

export function createMission(id: string, noctisSessionId: string): Mission {
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
  };
  store.set(id, mission);
  return mission;
}

export function getMission(id: string): Mission | undefined {
  return store.get(id);
}

export function setWorkerSession(
  missionId: string,
  agentId: WorkerAgentId,
  sessionId: string
): void {
  const mission = store.get(missionId);
  if (!mission) return;
  mission.workerSessions[agentId] = sessionId;
}

export function addTask(missionId: string, task: Task): void {
  const mission = store.get(missionId);
  if (!mission) return;
  mission.taskGraph.push(task);
  mission.delegationLedger.activeTasks.push({
    id: task.id,
    assignedTo: task.assignedTo,
    status: task.status,
  });
}

export function updateTask(
  missionId: string,
  taskId: string,
  status: TaskStatus,
  summary?: string
): void {
  const mission = store.get(missionId);
  if (!mission) return;

  const task = mission.taskGraph.find((t) => t.id === taskId);
  if (task) {
    task.status = status;
  }

  const ledgerEntry = mission.delegationLedger.activeTasks.find(
    (t) => t.id === taskId
  );
  if (ledgerEntry) {
    ledgerEntry.status = status;
  }

  if ((status === "completed" || status === "failed") && summary) {
    mission.delegationLedger.completedSummaries[taskId] = summary;
  }
}

export function buildDelegationLedger(mission: Mission): string {
  const ledger: DelegationLedger = mission.delegationLedger;
  return JSON.stringify(ledger, null, 2);
}

export function deleteMission(id: string): void {
  store.delete(id);
}

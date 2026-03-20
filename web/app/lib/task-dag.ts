import type { Task } from "./types/mission";

export function buildDependencyGraph(tasks: Task[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const task of tasks) {
    graph.set(task.id, task.dependencies);
  }
  return graph;
}

export function getExecutableWave(
  tasks: Task[],
  completedIds: Set<string>
): Task[] {
  return tasks.filter(
    (task) =>
      task.status === "pending" &&
      task.dependencies.every((dep) => completedIds.has(dep))
  );
}

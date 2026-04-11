import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "./get-project-root.server";
import { parseSessionContextUsageSnapshot } from "./session-context-usage";
import type { AgentContextUsage } from "./types/mission";

function getSessionContextStoreDir(): string {
  return join(getProjectRoot(), "runtime", "session-context");
}

function getSnapshotPath(sessionId: string): string {
  return join(getSessionContextStoreDir(), `${sessionId}.json`);
}

export function ensureSessionContextStoreDir(): void {
  const dir = getSessionContextStoreDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function readSessionContextUsage(sessionId: string): AgentContextUsage | null {
  const snapshotPath = getSnapshotPath(sessionId);
  if (!existsSync(snapshotPath)) {
    return null;
  }

  try {
    return parseSessionContextUsageSnapshot(JSON.parse(readFileSync(snapshotPath, "utf-8")));
  } catch {
    return null;
  }
}

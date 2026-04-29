import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const TMUX_ACTIVE_MISSION_STATE_FILE = "tmux-active-mission.json";

export interface TmuxActiveMissionState {
  missionId: string;
  updatedAt: string;
}

type TmuxActiveMissionRecord = TmuxActiveMissionState & {
  version: 1;
};

function getTmuxActiveMissionPath(root: string): string {
  return join(root, "runtime", TMUX_ACTIVE_MISSION_STATE_FILE);
}

function parseTmuxActiveMissionRecord(value: unknown): TmuxActiveMissionRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.version !== 1 || typeof record.missionId !== "string" || typeof record.updatedAt !== "string") {
    return null;
  }

  return {
    missionId: record.missionId,
    updatedAt: record.updatedAt,
    version: 1,
  };
}

export function readTmuxActiveMission(root: string): TmuxActiveMissionState | null {
  const path = getTmuxActiveMissionPath(root);
  if (!existsSync(path)) {
    return null;
  }

  try {
    const record = parseTmuxActiveMissionRecord(JSON.parse(readFileSync(path, "utf-8")));
    if (!record) {
      return null;
    }

    return {
      missionId: record.missionId,
      updatedAt: record.updatedAt,
    };
  } catch {
    return null;
  }
}

export function writeTmuxActiveMission(root: string, state: TmuxActiveMissionState): void {
  mkdirSync(join(root, "runtime"), { recursive: true });
  writeFileSync(
    getTmuxActiveMissionPath(root),
    `${JSON.stringify({ ...state, version: 1 }, null, 2)}\n`,
    "utf-8",
  );
}

export function clearTmuxActiveMission(root: string): void {
  rmSync(getTmuxActiveMissionPath(root), { force: true });
}
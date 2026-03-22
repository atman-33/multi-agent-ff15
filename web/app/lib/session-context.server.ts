import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentContextUsage } from "./types/mission";
import { getProjectRoot } from "./get-project-root.server";

type SessionContextSnapshotFile = {
  calculatedAt?: unknown;
  limitTokens?: unknown;
  modelID?: unknown;
  providerID?: unknown;
  remainingPercentage?: unknown;
  remainingTokens?: unknown;
  tokenBreakdown?: {
    cacheRead?: unknown;
    cacheWrite?: unknown;
    input?: unknown;
    output?: unknown;
    reasoning?: unknown;
    total?: unknown;
  };
  usedPercentage?: unknown;
  usedTokens?: unknown;
};

function getSessionContextStoreDir(): string {
  return join(getProjectRoot(), "runtime", "session-context");
}

function getSnapshotPath(sessionId: string): string {
  return join(getSessionContextStoreDir(), `${sessionId}.json`);
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
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
    const parsed = JSON.parse(readFileSync(snapshotPath, "utf-8")) as SessionContextSnapshotFile;
    const providerID = readString(parsed.providerID);
    const modelID = readString(parsed.modelID);
    const calculatedAt = readString(parsed.calculatedAt);
    const limitTokens = readNumber(parsed.limitTokens);
    const usedTokens = readNumber(parsed.usedTokens);
    const remainingTokens = readNumber(parsed.remainingTokens);
    const usedPercentage = readNumber(parsed.usedPercentage);
    const remainingPercentage = readNumber(parsed.remainingPercentage);
    const input = readNumber(parsed.tokenBreakdown?.input);
    const output = readNumber(parsed.tokenBreakdown?.output);
    const reasoning = readNumber(parsed.tokenBreakdown?.reasoning);
    const cacheRead = readNumber(parsed.tokenBreakdown?.cacheRead);
    const cacheWrite = readNumber(parsed.tokenBreakdown?.cacheWrite);
    const total = readNumber(parsed.tokenBreakdown?.total);

    if (
      !providerID ||
      !modelID ||
      !calculatedAt ||
      limitTokens === null ||
      usedTokens === null ||
      remainingTokens === null ||
      usedPercentage === null ||
      remainingPercentage === null ||
      input === null ||
      output === null ||
      reasoning === null ||
      cacheRead === null ||
      cacheWrite === null ||
      total === null
    ) {
      return null;
    }

    return {
      calculatedAt,
      limitTokens,
      modelID,
      providerID,
      remainingPercentage,
      remainingTokens,
      tokenBreakdown: {
        cacheRead,
        cacheWrite,
        input,
        output,
        reasoning,
        total,
      },
      usedPercentage,
      usedTokens,
    };
  } catch {
    return null;
  }
}

import type { AgentContextUsage } from "./types/mission";

type ModelLimitLike = {
  context?: number;
  input?: number;
  output?: number;
};

type ModelLike = {
  id?: string;
  limit?: ModelLimitLike;
};

type ProviderLike = {
  id?: string;
  models?: Record<string, ModelLike>;
};

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
  windowTokens?: unknown;
};

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function resolveSessionContextLimits(
  providers: ProviderLike[],
  model: { modelID: string; providerID: string },
  previousLimits?: { limitTokens: number; windowTokens: number } | null,
): { limitTokens: number; windowTokens: number } | null {
  const provider = providers.find((candidate) => candidate.id === model.providerID);
  const resolvedModel = provider?.models?.[model.modelID];
  const context = resolvedModel?.limit?.context;

  if (!Number.isFinite(context) || typeof context !== "number") {
    return previousLimits ?? null;
  }

  const input = resolvedModel?.limit?.input;

  return {
    limitTokens: typeof input === "number" && Number.isFinite(input) ? input : context,
    windowTokens: context,
  };
}

export function parseSessionContextUsageSnapshot(value: unknown): AgentContextUsage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const parsed = value as SessionContextSnapshotFile;
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
    windowTokens: readNumber(parsed.windowTokens) ?? limitTokens,
  };
}
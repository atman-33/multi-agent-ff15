import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "@opencode-ai/plugin";
import {
  parseSessionContextUsageSnapshot,
  resolveSessionContextLimits,
} from "../../web/app/lib/session-context-usage.ts";

type SessionContextSnapshot = {
  calculatedAt: string;
  limitTokens: number;
  modelID: string;
  providerID: string;
  remainingPercentage: number;
  remainingTokens: number;
  sessionId: string;
  tokenBreakdown: {
    cacheRead: number;
    cacheWrite: number;
    input: number;
    output: number;
    reasoning: number;
    total: number;
  };
  usedPercentage: number;
  usedTokens: number;
  windowTokens: number;
};

type AssistantMessageInfo = {
  modelID?: string;
  providerID?: string;
  role?: string;
  tokens?: {
    cache?: {
      read?: number;
      write?: number;
    };
    input?: number;
    output?: number;
    reasoning?: number;
    total?: number;
  };
};

type MessageWrapper = {
  info?: AssistantMessageInfo;
};

type ProviderRecord = {
  id?: string;
  models?: Record<
    string,
    {
      id?: string;
      limit?: {
        context?: number;
        input?: number;
        output?: number;
      };
    }
  >;
};

function getSnapshotPath(directory: string, sessionId: string): string {
  return join(directory, "runtime", "session-context", `${sessionId}.json`);
}

function readPreviousLimits(
  directory: string,
  sessionId: string,
): { limitTokens: number; windowTokens: number } | null {
  const snapshotPath = getSnapshotPath(directory, sessionId);
  if (!existsSync(snapshotPath)) {
    return null;
  }

  try {
    const parsed = parseSessionContextUsageSnapshot(JSON.parse(readFileSync(snapshotPath, "utf-8")));
    if (!parsed) {
      return null;
    }

    return {
      limitTokens: parsed.limitTokens,
      windowTokens: parsed.windowTokens,
    };
  } catch {
    return null;
  }
}

async function readProviders(client: unknown): Promise<ProviderRecord[]> {
  const configClient = (client as { config?: { providers?: () => Promise<unknown> } }).config;
  if (!configClient?.providers) {
    return [];
  }

  try {
    const result = (await configClient.providers()) as {
      data?: { providers?: ProviderRecord[] };
      error?: unknown;
    };

    if (result.error || !result.data || !Array.isArray(result.data.providers)) {
      return [];
    }

    return result.data.providers;
  } catch {
    return [];
  }
}

function normalizeSnapshot(
  sessionId: string,
  info: AssistantMessageInfo,
  limits: { limitTokens: number; windowTokens: number } | null,
): SessionContextSnapshot | null {
  const providerID = typeof info.providerID === "string" ? info.providerID : null;
  const modelID = typeof info.modelID === "string" ? info.modelID : null;
  const tokens = info.tokens;

  if (!providerID || !modelID || !tokens || !limits) {
    return null;
  }

  const input = Math.max(0, tokens.input ?? 0);
  const output = Math.max(0, tokens.output ?? 0);
  const reasoning = Math.max(0, tokens.reasoning ?? 0);
  const cacheRead = Math.max(0, tokens.cache?.read ?? 0);
  const cacheWrite = Math.max(0, tokens.cache?.write ?? 0);
  const total = Math.max(0, tokens.total ?? input + output + reasoning + cacheRead + cacheWrite);
  const { limitTokens, windowTokens } = limits;
  const usedTokens = Math.min(limitTokens, Math.max(0, input + cacheRead));
  const remainingTokens = Math.max(0, limitTokens - usedTokens);

  return {
    calculatedAt: new Date().toISOString(),
    limitTokens,
    modelID,
    providerID,
    remainingPercentage: remainingTokens / limitTokens,
    remainingTokens,
    sessionId,
    tokenBreakdown: {
      cacheRead,
      cacheWrite,
      input,
      output,
      reasoning,
      total,
    },
    usedPercentage: usedTokens / limitTokens,
    usedTokens,
    windowTokens,
  };
}

function extractSessionId(value: Record<string, unknown>): string | null {
  const props = value.properties as Record<string, unknown> | undefined;
  const info = props?.info as Record<string, unknown> | undefined;
  const part = props?.part as Record<string, unknown> | undefined;
  const candidates = [
    value.sessionID,
    value.sessionId,
    value.id,
    props?.sessionID,
    props?.sessionId,
    info?.id,
    part?.sessionID,
    part?.sessionId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

async function writeLatestSnapshot(
  client: unknown,
  sessionId: string,
  directory: string,
): Promise<void> {
  const sessionClient = (client as { session?: { messages?: (input: unknown) => Promise<unknown> } }).session;
  if (!sessionClient?.messages) {
    return;
  }

  try {
    const result = await sessionClient.messages({ path: { id: sessionId } });
    const data = (result as { data?: MessageWrapper[] }).data ?? [];
    const lastAssistant = [...data]
      .reverse()
      .map((message) => message.info)
      .find((info): info is AssistantMessageInfo => info?.role === "assistant");

    if (!lastAssistant) {
      return;
    }

    const previousLimits = readPreviousLimits(directory, sessionId);
    const providers = await readProviders(client);
    const limits =
      typeof lastAssistant.providerID === "string" && typeof lastAssistant.modelID === "string"
        ? resolveSessionContextLimits(
            providers,
            {
              modelID: lastAssistant.modelID,
              providerID: lastAssistant.providerID,
            },
            previousLimits,
          )
        : previousLimits;
    const snapshot = normalizeSnapshot(sessionId, lastAssistant, limits);
    if (!snapshot) {
      return;
    }

    mkdirSync(join(directory, "runtime", "session-context"), { recursive: true });
    writeFileSync(getSnapshotPath(directory, sessionId), `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");
  } catch {
    // Never interrupt agent execution because of telemetry writes.
  }
}

async function removeSnapshot(directory: string, sessionId: string): Promise<void> {
  rmSync(getSnapshotPath(directory, sessionId), { force: true });
}

const ContextUsageSnapshotPlugin: Plugin = async ({ client, directory }) => {
  return {
    event: async ({ event }: { event: { properties?: unknown; type: string } }) => {
      const eventRecord = event as unknown as Record<string, unknown>;

      if (event.type === "session.deleted") {
        const sessionId = extractSessionId(eventRecord);
        if (sessionId) {
          await removeSnapshot(directory, sessionId);
        }
        return;
      }

      if (event.type === "session.idle") {
        const sessionId = extractSessionId(eventRecord);
        if (sessionId) {
          await writeLatestSnapshot(client, sessionId, directory);
        }
      }
    },
  };
};

export default ContextUsageSnapshotPlugin;
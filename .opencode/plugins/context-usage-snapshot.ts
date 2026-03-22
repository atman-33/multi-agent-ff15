import type { Plugin } from "@opencode-ai/plugin";

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

const COPILOT_DEFAULT_LIMIT = 128_000;
const DEFAULT_CONTEXT_LIMIT = 128_000;
const ANTHROPIC_CONTEXT_LIMIT = 200_000;

function getContextLimit(providerID: string, modelID: string): number {
  if (providerID === "anthropic") {
    return ANTHROPIC_CONTEXT_LIMIT;
  }

  if (providerID === "github-copilot") {
    return COPILOT_DEFAULT_LIMIT;
  }

  if (providerID === "google") {
    return 1_000_000;
  }

  if (providerID === "openai") {
    return 128_000;
  }

  if (modelID.startsWith("claude-")) {
    return ANTHROPIC_CONTEXT_LIMIT;
  }

  return DEFAULT_CONTEXT_LIMIT;
}

function normalizeSnapshot(sessionId: string, info: AssistantMessageInfo): SessionContextSnapshot | null {
  const providerID = typeof info.providerID === "string" ? info.providerID : null;
  const modelID = typeof info.modelID === "string" ? info.modelID : null;
  const tokens = info.tokens;

  if (!providerID || !modelID || !tokens) {
    return null;
  }

  const input = Math.max(0, tokens.input ?? 0);
  const output = Math.max(0, tokens.output ?? 0);
  const reasoning = Math.max(0, tokens.reasoning ?? 0);
  const cacheRead = Math.max(0, tokens.cache?.read ?? 0);
  const cacheWrite = Math.max(0, tokens.cache?.write ?? 0);
  const total = Math.max(0, tokens.total ?? input + output + reasoning + cacheRead + cacheWrite);
  const limitTokens = getContextLimit(providerID, modelID);
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

async function writeLatestSnapshot(client: unknown, sessionId: string): Promise<void> {
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

    const snapshot = normalizeSnapshot(sessionId, lastAssistant);
    if (!snapshot) {
      return;
    }

    const shell = (client as unknown as { $?: (strings: TemplateStringsArray, ...values: unknown[]) => { quiet(): Promise<unknown> } }).$;
    if (!shell) {
      return;
    }

    await shell`mkdir -p runtime/session-context`.quiet();
    await shell`printf '%s\n' ${JSON.stringify(snapshot, null, 2)} > ${`runtime/session-context/${sessionId}.json`}`.quiet();
  } catch {
    // Never interrupt agent execution because of telemetry writes.
  }
}

async function removeSnapshot(client: unknown, sessionId: string): Promise<void> {
  const shell = (client as unknown as { $?: (strings: TemplateStringsArray, ...values: unknown[]) => { quiet(): Promise<unknown> } }).$;
  if (!shell) {
    return;
  }

  await shell`rm -f ${`runtime/session-context/${sessionId}.json`}`.quiet();
}

const ContextUsageSnapshotPlugin: Plugin = async ({ $, client }) => {
  return {
    "tool.execute.after": async (input: { sessionID?: string }) => {
      if (typeof input.sessionID !== "string" || input.sessionID.length === 0) {
        return;
      }

      await writeLatestSnapshot({ $, session: (client as { session?: unknown }).session }, input.sessionID);
    },
    event: async ({ event }: { event: { properties?: unknown; type: string } }) => {
      const eventRecord = event as unknown as Record<string, unknown>;

      if (event.type === "session.deleted") {
        const sessionId = extractSessionId(eventRecord);
        if (sessionId) {
          await removeSnapshot({ $ }, sessionId);
        }
        return;
      }

      if (event.type === "session.idle") {
        const sessionId = extractSessionId(eventRecord);
        if (sessionId) {
          await writeLatestSnapshot({ $, session: (client as { session?: unknown }).session }, sessionId);
        }
      }
    },
  };
};

export default ContextUsageSnapshotPlugin;
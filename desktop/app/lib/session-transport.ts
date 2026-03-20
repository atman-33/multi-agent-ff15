import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { join } from "node:path";
import type { Session } from "@opencode-ai/sdk/v2/client";
import { AGENT_PANE_INDEX, type ModelSwitchAgent } from "@/constants/agents";
import { getClientForAgent } from "@/lib/opencode-client.server";
import type {
  RuntimeTargetSwitchStatus,
  RuntimeTargetTransportMode,
} from "@/lib/runtime-target-state";

const INBOX_MESSAGE_ID_REGEX = /Message\s+(msg_[^\s]+)/;

export interface RuntimeTargetAuditPayload {
  action: string;
  agent: string;
  content?: string;
  metadata?: Record<string, unknown> | null;
  sessionId: string | null;
  source: string;
  switchStatus: RuntimeTargetSwitchStatus;
  threadId: string | null;
  transportMode: RuntimeTargetTransportMode;
}

export interface SendCrystalPromptInput {
  agent: string;
  content: string;
  root: string;
  sessionId: string | null;
  threadId: string | null;
}

export interface SendCrystalPromptResult {
  delivery: "direct" | "fallback";
  event: string;
  messageId: string | null;
  sessionId: string | null;
  switchStatus: RuntimeTargetSwitchStatus;
  transportMode: RuntimeTargetTransportMode;
}

export interface SessionTransportAdapter {
  mode: RuntimeTargetTransportMode;
  sendCrystalPrompt(input: SendCrystalPromptInput): Promise<SendCrystalPromptResult>;
  supportsExplicitSessionTargeting(agent: string): boolean;
}

export class DirectSessionTransportAdapter implements SessionTransportAdapter {
  readonly mode = "direct_session" satisfies RuntimeTargetTransportMode;

  supportsExplicitSessionTargeting(agent: string): boolean {
    return getClientForAgent(agent) !== null;
  }

  async sendCrystalPrompt(
    input: SendCrystalPromptInput
  ): Promise<SendCrystalPromptResult> {
    if (!input.sessionId) {
      throw new Error("sessionId is required for direct transport");
    }

    const client = getClientForAgent(input.agent);
    if (!client) {
      throw new Error(`No SDK client found for agent: ${input.agent}`);
    }

    const response = await client.session.promptAsync({
      directory: input.root,
      parts: [
        {
          text: input.content,
          type: "text",
        },
      ],
      sessionID: input.sessionId,
    });
    if (response.error) {
      throw new Error(String(response.error));
    }

    appendRuntimeTargetAuditRecord(input.root, {
      action: "direct_crystal_prompt",
      agent: input.agent,
      content: "Crystal prompt delivered via explicit runtime session.",
      metadata: {
        message: input.content,
      },
      sessionId: input.sessionId,
      source: "crystal",
      switchStatus: "ready",
      threadId: input.threadId,
      transportMode: this.mode,
    });

    return {
      delivery: "direct",
      event: "direct_crystal_prompt",
      messageId: null,
      sessionId: input.sessionId,
      switchStatus: "ready",
      transportMode: this.mode,
    };
  }
}

export class InboxFallbackTransportAdapter implements SessionTransportAdapter {
  readonly mode = "inbox_fallback" satisfies RuntimeTargetTransportMode;

  supportsExplicitSessionTargeting(): boolean {
    return false;
  }

  sendCrystalPrompt(
    input: SendCrystalPromptInput
  ): Promise<SendCrystalPromptResult> {
    const rootScript = join(input.root, "scripts/inbox_write.sh");
    const result = spawnSync(
      "bash",
      [rootScript, input.agent, "crystal", "message", input.content],
      {
        cwd: input.root,
        encoding: "utf-8",
      }
    );

    if (result.status !== 0) {
      throw new Error(result.stderr || "inbox_write.sh failed");
    }

    const match = (result.stdout || "").match(INBOX_MESSAGE_ID_REGEX);
    const messageId = match ? match[1] : null;

    appendRuntimeTargetAuditRecord(input.root, {
      action: "inbox_fallback_prompt",
      agent: input.agent,
      content:
        "Crystal prompt delivered through inbox fallback because explicit session transport is unavailable.",
      metadata: {
        message: input.content,
      },
      sessionId: input.sessionId,
      source: "crystal",
      switchStatus: "unsupported",
      threadId: input.threadId,
      transportMode: this.mode,
    });

    return Promise.resolve({
      delivery: "fallback",
      event: "inbox_fallback_prompt",
      messageId,
      sessionId: input.sessionId,
      switchStatus: "unsupported",
      transportMode: this.mode,
    });
  }
}

export function createCrystalSessionTransport(
  agent: string
): SessionTransportAdapter {
  const direct = new DirectSessionTransportAdapter();
  if (direct.supportsExplicitSessionTargeting(agent)) {
    return direct;
  }

  return new InboxFallbackTransportAdapter();
}

export function appendRuntimeTargetAuditRecord(
  root: string,
  payload: RuntimeTargetAuditPayload
): void {
  const logPath = join(root, "runtime/logs/agent-chat-monitor.jsonl");
  const pane = AGENT_PANE_INDEX[payload.agent as ModelSwitchAgent];
  const record = {
    agent: payload.agent,
    content: payload.content ?? payload.action,
    data: {
      ...(payload.metadata ?? {}),
      switchStatus: payload.switchStatus,
      threadId: payload.threadId,
      transportMode: payload.transportMode,
    },
    id: `${payload.action}-${Date.now()}`,
    kind: "status",
    meta: {
      event: payload.action,
      pane: pane !== undefined ? String(pane) : "0",
      transport_mode: payload.transportMode,
    },
    session_id: payload.sessionId ?? "runtime-target",
    source: payload.source,
    ts: new Date().toISOString(),
  };
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf-8");
}

export async function resolveSessionForPrompt(
  agent: string,
  root: string,
  sessionId: string | null
): Promise<Session | null> {
  if (!sessionId) {
    return null;
  }

  const client = getClientForAgent(agent);
  if (!client) {
    return null;
  }

  const response = await client.session.get({ directory: root, sessionID: sessionId });
  if (response.error || !response.data) {
    return null;
  }

  return response.data;
}

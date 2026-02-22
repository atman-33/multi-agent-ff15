import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

// ---------------------------------------------------------------------------
// JSONL Logger types & utilities
// ---------------------------------------------------------------------------

interface ChatLogRecord {
  id: string;
  ts: string;
  agent: string;
  source: string;
  kind: "answer" | "status" | "error";
  content: string;
  session_id: string;
  meta: {
    pane: string;
    event: string;
  };
}

/** Remove ANSI escape sequences and normalize line endings. */
function normalizeContent(raw: string): string {
  // Strip ANSI escape codes (CSI sequences, OSC, etc.)
  // eslint-disable-next-line no-control-regex
  const stripped = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[@-Z\\-_]/g, "");
  // Normalize multiple blank lines
  return stripped.replace(/\n{3,}/g, "\n\n").trim();
}

/** Generate a simple unique ID. */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Rotate JSONL file if it exceeds MAX_LOG_SIZE_BYTES.
 * Keeps up to MAX_LOG_GENERATIONS generations (.1 through .5).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rotateIfNeeded($: any, logPath: string): Promise<void> {
  const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
  const MAX_LOG_GENERATIONS = 5;

  try {
    // Get file size in bytes (returns "0" if file doesn't exist)
    const sizeStr = await $`wc -c < ${logPath} 2>/dev/null || echo 0`.text();
    const size = parseInt(sizeStr.trim(), 10);

    if (size < MAX_LOG_SIZE_BYTES) return;

    // Remove oldest generation if it exists
    await $`rm -f ${logPath}.${MAX_LOG_GENERATIONS}`.quiet();

    // Shift generations: .4 -> .5, .3 -> .4, ... .1 -> .2
    for (let i = MAX_LOG_GENERATIONS - 1; i >= 1; i--) {
      await $`mv -f ${logPath}.${i} ${logPath}.${i + 1} 2>/dev/null || true`.quiet();
    }

    // Current file -> .1
    await $`mv -f ${logPath} ${logPath}.1`.quiet();
  } catch {
    // Rotation errors are non-fatal
  }
}

/**
 * Append a ChatLogRecord to the JSONL file.
 * - Exception-isolated: never throws.
 * - Uses flock for exclusive access to prevent concurrent corruption.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function appendJsonlRecord($: any, logPath: string, record: ChatLogRecord): Promise<void> {
  try {
    // Ensure directory exists
    const logDir = logPath.substring(0, logPath.lastIndexOf("/"));
    await $`mkdir -p ${logDir}`.quiet();

    // Rotate if needed
    await rotateIfNeeded($, logPath);

    // Serialize (single JSON line)
    const line = JSON.stringify(record);

    // Append with flock for exclusive access.
    // zx-style $`...` auto-escapes ${line} and ${logPath}.
    // The >> redirect is a static shell operator so it's not escaped by $.
    await $`flock -x -w 5 ${logPath + ".lock"} -c ${"printf '%s\\n' " + JSON.stringify(line) + " >> " + JSON.stringify(logPath)}`.quiet();
  } catch (err) {
    // Warning only – never interrupt dashboard send
    try {
      const ts = new Date().toISOString();
      await $`echo ${`[${ts}] agent-chat-monitor JSONL write warning: ${err}`} >> logs/agent-chat-monitor-warn.log`.quiet();
    } catch { }
  }
}

// ---------------------------------------------------------------------------
// Existing content extraction helpers
// ---------------------------------------------------------------------------

function extractUserContent(rawContent: string): string | null {
  if (rawContent.includes("[analyze-mode]")) {
    const sections = rawContent.split(/\n---\n/);
    if (sections.length > 1) {
      const lastSection = sections[sections.length - 1].trim();
      return `[User] ${lastSection}`;
    }
  }

  const withoutSkillBlocks = rawContent
    .replace(/<skill-instruction>[\s\S]*?<\/skill-instruction>/g, "")
    .replace(/<user-request>([\s\S]*?)<\/user-request>/g, "$1");

  const withoutPrefix = withoutSkillBlocks.replace(/^\[user\]\n*/i, "").trim();
  const cleaned = withoutPrefix.replace(/\n{3,}/g, "\n\n").trim();

  return cleaned ? `[User] ${cleaned}` : null;
}

function extractAssistantContent(rawContent: string, agentName: string): string | null {
  if (rawContent.includes("<content>") && rawContent.includes("</content>")) {
    const contentBlockPattern = /<content>[\s\S]*?<\/content>/g;
    const withoutContent = rawContent.replace(contentBlockPattern, "").trim();
    if (withoutContent.length === 0 || withoutContent.match(/^\[Tool: read\]\n*$/)) {
      return null;
    }
  }

  if (rawContent.includes("[Tool:")) {
    const toolPattern = /\[Tool: \w+\][\s\S]*?(Output:.*?\n)?/g;
    const withoutTools = rawContent.replace(toolPattern, "").trim();

    if (withoutTools.length > 0 && !withoutTools.match(/^[\s\-]+$/)) {
      return processAssistantText(withoutTools, agentName);
    }
    return null;
  }

  return processAssistantText(rawContent, agentName);
}

function processAssistantText(content: string, agentName: string): string | null {
  const withoutFileContent = content.replace(/<content>[\s\S]*?<\/content>/g, "[ファイル内容省略]");
  const withoutReadme = withoutFileContent.replace(/\[Project README:[\s\S]*?---\n\n/m, "");
  const cleaned = withoutReadme.replace(/\n{3,}/g, "\n\n").trim();

  return cleaned ? `${cleaned}` : null;
}

const AgentChatMonitor: Plugin = async ({ $, client }) => {
  const agentId = process.env.AGENT_ID;

  // Run for all agents (noctis, lunafreya, ignis, gladiolus, prompto, iris)
  const KNOWN_AGENTS = ["noctis", "lunafreya", "ignis", "gladiolus", "prompto", "iris"];
  if (!agentId || !KNOWN_AGENTS.includes(agentId)) {
    return {};
  }

  const COOLDOWN_MS = 300; // 300 ms — reduced to avoid missing the idle event right after response completion
  const ENABLE_LOGGING = false;
  const JSONL_LOG_PATH = "runtime/logs/agent-chat-monitor.jsonl";

  let lastCaptureTime = 0;
  let currentSessionId: string | null = null;
  /**
   * C案: in-memory cursor.
   * Tracks how many assistant messages have already been written to JSONL for
   * the current session. On session.created it resets to 0, so each new
   * session starts fresh without re-logging old messages.
   */
  let lastLoggedAssistantCount = 0;

  const log = async (message: string): Promise<void> => {
    if (!ENABLE_LOGGING) return;
    try {
      const timestamp = new Date().toISOString();
      await $`echo "[${timestamp}] agent-chat-monitor (${agentId}): ${message}" >> logs/agent-chat-monitor.log`.quiet();
    } catch { }
  };

  return {
    event: async ({ event }) => {
      if (event.type === "session.created") {
        const eventAny = event as any;
        const newSessionId =
          eventAny.session_id ||
          eventAny.sessionID ||
          eventAny.sessionId ||
          eventAny.id ||
          eventAny.properties?.session_id ||
          eventAny.properties?.sessionID ||
          eventAny.properties?.sessionId ||
          eventAny.properties?.id;

        if (newSessionId) {
          currentSessionId = newSessionId;
          lastLoggedAssistantCount = 0; // reset cursor for new session
          if (ENABLE_LOGGING) {
            await log(`Captured session ID from session.created: ${newSessionId}`);
          }
        }
      }

      if (event.type !== "session.idle") return;

      const now = Date.now();
      if (now - lastCaptureTime < COOLDOWN_MS) {
        if (ENABLE_LOGGING) {
          await log("Skipped capture (cooldown active)");
        }
        return;
      }
      lastCaptureTime = now;

      try {
        let sessionId = currentSessionId;

        if (!sessionId) {
          const eventAny = event as any;
          sessionId =
            eventAny.session_id ||
            eventAny.sessionID ||
            eventAny.sessionId ||
            eventAny.id ||
            eventAny.properties?.session_id ||
            eventAny.properties?.sessionID ||
            eventAny.properties?.sessionId ||
            eventAny.properties?.id;
        }

        if (!sessionId) {
          try {
            const sessionsResult = await client.session.list();
            if (sessionsResult?.data && Array.isArray(sessionsResult.data) && sessionsResult.data.length > 0) {
              sessionId = sessionsResult.data[0].id;
            }
          } catch { }
        }

        if (!sessionId) {
          return;
        }

        const messagesResult = await client.session.messages({
          path: { id: sessionId },
        });

        if (!messagesResult?.data || messagesResult.data.length === 0) {
          return;
        }

        const DISPLAY_NAMES: Record<string, string> = {
          noctis: "Noctis",
          lunafreya: "Lunafreya",
          ignis: "Ignis",
          gladiolus: "Gladiolus",
          prompto: "Prompto",
          iris: "Iris",
        };
        const agentDisplayName = DISPLAY_NAMES[agentId] ?? agentId;

        // --- JSONL logging ---
        // IMPORTANT: This runs BEFORE the conversation-pair grouping check so that
        // assistant messages are never missed even when no User→Assistant pairs exist
        // (e.g. orphaned assistant messages, tool-only responses, etc.).
        //
        // Fix for sliding-window cursor drift: iterate over the FULL message list
        // (messagesResult.data) instead of the capped sliding window, so the cursor
        // stays in sync with the actual session history regardless of its length.
        const PANE_MAP: Record<string, string> = {
          noctis: "0",
          lunafreya: "1",
          ignis: "2",
          gladiolus: "3",
          prompto: "4",
          iris: "5",
        };
        const pane = PANE_MAP[agentId] ?? "0";

        // Build assistant item list from ALL messages (no sliding-window cap)
        const allAssistantItems: { content: string }[] = [];
        for (const msg of messagesResult.data) {
          const msgAny = msg as any;
          const role = msgAny.info?.role || "unknown";
          if (role !== "assistant") continue;
          let rawContent = "";
          if (Array.isArray(msgAny.parts)) {
            rawContent = msgAny.parts
              .map((part: any) => (part.type === "text" && part.text ? part.text : ""))
              .filter((text: string) => text.trim().length > 0)
              .join("\n\n");
          }
          const extracted = extractAssistantContent(rawContent, agentDisplayName);
          if (extracted && extracted.trim().length > 0) {
            allAssistantItems.push({ content: extracted });
          }
        }

        const newItems = allAssistantItems.slice(lastLoggedAssistantCount);
        for (const item of newItems) {
          const normalized = normalizeContent(item.content);
          if (!normalized) continue;
          const record: ChatLogRecord = {
            id: generateId(),
            ts: new Date().toISOString(),
            agent: agentId,
            source: "terminal_capture",
            kind: "answer",
            content: normalized,
            session_id: sessionId ?? "unknown",
            meta: { pane, event: "assistant_response" },
          };
          await appendJsonlRecord($, JSONL_LOG_PATH, record);
        }
        // Advance cursor to the full count so subsequent calls only log truly new messages.
        lastLoggedAssistantCount = allAssistantItems.length;

      } catch (error) {
        if (ENABLE_LOGGING) {
          await log(`Error in event handler: ${error}`);
        }
      }
    },
  };
};

export default AgentChatMonitor;

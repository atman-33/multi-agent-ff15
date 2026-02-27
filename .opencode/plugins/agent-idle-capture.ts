import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

// ---------------------------------------------------------------------------
// Helpers: extract readable content from message parts
// ---------------------------------------------------------------------------

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
  // Preserve raw markdown — do NOT convert headings to bold
  const withoutFileContent = content.replace(/<content>[\s\S]*?<\/content>/g, "[ファイル内容省略]");
  const withoutReadme = withoutFileContent.replace(/\[Project README:[\s\S]*?---\n\n/m, "");
  const cleaned = withoutReadme.replace(/\n{3,}/g, "\n\n").trim();

  return cleaned ? `[${agentName}] ${cleaned}` : null;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const AgentIdleCapture: Plugin = async ({ $, client }) => {
  const agentId = process.env.AGENT_ID;

  // Activate only for noctis and lunafreya
  if (agentId !== "noctis" && agentId !== "lunafreya") {
    return {};
  }

  const COOLDOWN_MS = 10_000; // 10 seconds

  let lastCaptureTime = 0;
  let currentSessionId: string | null = null;

  const agentDisplayName = agentId === "noctis" ? "Noctis" : "Lunafreya";

  const log = async (message: string): Promise<void> => {
    try {
      const timestamp = new Date().toISOString();
      await $`echo "[${timestamp}] agent-idle-capture (${agentId}): ${message}" >> logs/agent-idle-capture.log`.quiet();
    } catch { }
  };

  await log("agent-idle-capture started");

  return {
    event: async ({ event }) => {
      // Capture session ID on session.created
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
          await log(`Captured session ID: ${newSessionId}`);
        }
      }

      if (event.type !== "session.idle") return;

      await log("[TRIGGER] session.idle fired");

      // Cooldown check
      const now = Date.now();
      if (now - lastCaptureTime < COOLDOWN_MS) {
        await log("Skipped (cooldown active)");
        return;
      }
      lastCaptureTime = now;

      try {
        // Resolve session ID
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
          await log("No session ID found, skipping");
          return;
        }

        // Fetch recent messages
        const messagesResult = await client.session.messages({
          path: { id: sessionId },
        });

        if (!messagesResult?.data || messagesResult.data.length === 0) {
          await log("No messages found");
          return;
        }

        // Find the latest assistant message
        const messages = messagesResult.data.slice(-20);
        let latestAssistantContent: string | null = null;

        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          const role = msg.info?.role || "unknown";
          if (role !== "assistant") continue;

          let rawContent = "";
          if (Array.isArray(msg.parts)) {
            rawContent = msg.parts
              .map((part: any) => {
                if (part.type === "text" && part.text) return part.text;
                return "";
              })
              .filter((text: string) => text.trim().length > 0)
              .join("\n\n");
          }

          const extracted = extractAssistantContent(rawContent, agentDisplayName);
          if (extracted && extracted.trim().length > 0) {
            latestAssistantContent = extracted;
            break;
          }
        }

        if (!latestAssistantContent) {
          await log("No extractable assistant content found");
          return;
        }

        // Send to Iris inbox
        const message = `[${agentDisplayName} latest response]\n\n${latestAssistantContent}\n\nPlease update relevant dashboard sections (Requires Action, Skill Candidates, etc.) as needed.`;

        await $`scripts/inbox_write.sh iris ${agentId} agent_idle_capture ${message}`.quiet();
        await log(`Sent latest response to Iris (${latestAssistantContent.length} chars)`);

      } catch (error) {
        await log(`Error: ${error}`);
      }
    },
  };
};

export default AgentIdleCapture;

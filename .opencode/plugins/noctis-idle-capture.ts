import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

function extractUserContent(rawContent: string): string | null {
  if (rawContent.includes("[analyze-mode]")) {
    const sections = rawContent.split(/\n---\n/);
    if (sections.length > 1) {
      const lastSection = sections[sections.length - 1].trim();
      return `[User] ${lastSection}`;
    }
  }

  const cleanContent = rawContent.replace(/^\[user\]\n*/i, "").trim();
  return cleanContent ? `[User] ${cleanContent}` : null;
}

function extractAssistantContent(rawContent: string): string | null {
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
      return processAssistantText(withoutTools);
    }
    return null;
  }

  return processAssistantText(rawContent);
}

function processAssistantText(content: string): string | null {
  const withoutFileContent = content.replace(/<content>[\s\S]*?<\/content>/g, "[ファイル内容省略]");
  const withoutReadme = withoutFileContent.replace(/\[Project README:[\s\S]*?---\n\n/m, "");
  const cleaned = withoutReadme.replace(/\n{3,}/g, "\n\n").trim();

  return cleaned ? `[Noctis] ${cleaned}` : null;
}

const NoctisIdleCapture: Plugin = async ({ $, client }) => {
  const agentId = process.env.AGENT_ID;
  if (agentId !== "noctis") {
    return {};
  }

  const COOLDOWN_MS = 10_000;
  const ENABLE_LOGGING = false;
  const MAX_MESSAGES = 5;

  let lastCaptureTime = 0;
  let currentSessionId: string | null = null;

  const log = async (message: string): Promise<void> => {
    if (!ENABLE_LOGGING) return;
    try {
      const timestamp = new Date().toISOString();
      await $`echo "[${timestamp}] noctis-idle-capture: ${message}" >> logs/noctis-idle-capture.log`.quiet();
    } catch { }
  };



  // if (ENABLE_LOGGING) {
  //   await log("Noctis Idle Capture plugin started");
  // }

  return {
    event: async ({ event }) => {
      // if (ENABLE_LOGGING) {
      //   await log(`Event received: type=${event.type}`);
      // }

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

        const messages = messagesResult.data.slice(-MAX_MESSAGES);

        const extractedContents: string[] = [];
        for (let idx = 0; idx < messages.length; idx++) {
          const msg = messages[idx];
          const role = msg.info?.role || "unknown";

          let rawContent = "";
          if (Array.isArray(msg.parts)) {
            rawContent = msg.parts
              .map((part: any) => {
                if (part.type === "text" && part.text) {
                  return part.text;
                }
                return "";
              })
              .filter((text: string) => text.trim().length > 0)
              .join("\n\n");
          }



          let extractedContent: string | null = null;
          if (role === "user") {
            extractedContent = extractUserContent(rawContent);
          } else if (role === "assistant") {
            extractedContent = extractAssistantContent(rawContent);
          }



          if (extractedContent && extractedContent.trim().length > 0) {
            extractedContents.push(extractedContent);
          }
        }

        const formattedContent = extractedContents.join("\n\n---\n\n");



        if (!formattedContent.trim()) {
          return;
        }

        const escapedContent = formattedContent.replace(/'/g, "'\\''");
        await $`scripts/inbox_write.sh iris noctis noctis_idle_capture '${escapedContent}'`.quiet();

      } catch { }
    },
  };
};

export default NoctisIdleCapture;

import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

const NoctisIdleCapture: Plugin = async ({ $ }) => {
  const agentId = process.env.AGENT_ID;
  if (agentId !== "noctis") {
    return {};
  }

  const COOLDOWN_MS = 10_000;
  const ENABLE_LOGGING = false;

  let lastCaptureTime = 0;
  let currentSessionId: string | null = null;

  const log = async (message: string): Promise<void> => {
    if (!ENABLE_LOGGING) return;
    try {
      const timestamp = new Date().toISOString();
      await $`echo "[${timestamp}] noctis-idle-capture: ${message}" >> logs/noctis-idle-capture.log`.quiet();
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
        // Send lightweight notification to Iris
        const notificationMessage = "Noctis chat log has been updated in dashboard.md. Please read '### 💬 Noctis Latest Chat' section and update relevant dashboard sections (Requires Action, Skill Candidates, etc.) as needed.";
        
        await $`scripts/inbox_write.sh iris noctis noctis_idle_capture '${notificationMessage}'`.quiet();

        if (ENABLE_LOGGING) {
          await log("Sent idle notification to Iris");
        }
      } catch (error) {
        if (ENABLE_LOGGING) {
          await log(`Error sending notification: ${error}`);
        }
      }
    },
  };
};

export default NoctisIdleCapture;

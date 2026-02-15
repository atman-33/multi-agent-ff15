import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * Noctis Idle Capture — On session.idle, captures Noctis terminal (300 lines)
 * and sends to Iris inbox for dashboard update. Runs on Noctis only.
 */
const NoctisIdleCapture: Plugin = async ({ $ }) => {
  const agentId = process.env.AGENT_ID;
  if (agentId !== "noctis") {
    return {};
  }

  const NOCTIS_PANE = "ff15:main.0";
  const CAPTURE_LINES = 300;
  const COOLDOWN_MS = 10_000;
  const ENABLE_LOGGING = false;

  let lastCaptureTime = 0;

  const log = async (message: string): Promise<void> => {
    if (!ENABLE_LOGGING) return;
    try {
      const timestamp = new Date().toISOString();
      await $`echo "[${timestamp}] noctis-idle-capture: ${message}" >> logs/noctis-idle-capture.log`.quiet();
    } catch {}
  };

  await log("Noctis Idle Capture plugin started");

  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle") return;

      const now = Date.now();
      if (now - lastCaptureTime < COOLDOWN_MS) {
        await log("Skipped capture (cooldown active)");
        return;
      }
      lastCaptureTime = now;

      try {
        // Simply capture last 300 lines from tmux pane
        const result = await $`tmux capture-pane -t ${NOCTIS_PANE} -p -S -${CAPTURE_LINES} -E -1`.quiet();
        const capturedOutput = result.text().trim();

        if (!capturedOutput) {
          await log("Empty capture, skipping");
          return;
        }

        await $`scripts/inbox_write.sh iris noctis noctis_idle_capture ${capturedOutput}`.quiet();
        await log(`Sent ${capturedOutput.split("\n").length} lines to Iris inbox`);
      } catch (err) {
        await log(`Capture failed: ${err}`);
      }
    },
  };
};

export default NoctisIdleCapture;

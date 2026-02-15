import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * Noctis Idle Capture — On session.idle, captures Noctis terminal
 * and sends cleaned output to Iris inbox for dashboard update. Runs on Noctis only.
 *
 * Capture strategy:
 *   1. Capture 300 lines of scrollback from tmux
 *   2. Strip ANSI escape sequences
 *   3. Filter out noise (empty lines, shell prompts, known commands)
 *   4. Take last 80 meaningful lines
 */
const NoctisIdleCapture: Plugin = async ({ $ }) => {
  const agentId = process.env.AGENT_ID;
  if (agentId !== "noctis") {
    return {};
  }

  const NOCTIS_PANE = "ff15:main.0";
  const RAW_CAPTURE_LINES = 300;  // Capture more raw lines to find useful content
  const OUTPUT_LINES = 80;        // Send at most this many cleaned lines to Iris
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
        // Capture raw output, strip ANSI codes, filter noise, take last N lines
        const result = await $`tmux capture-pane -t ${NOCTIS_PANE} -p -S -${RAW_CAPTURE_LINES} -E -1 | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g; s/\x1b\][^\x07]*\x07//g; s/\x1b(B//g; s/\x1b\[[\?]*[0-9;]*[a-zA-Z]//g' | grep -v '^\s*$' | grep -v '^\s*\\\\' | grep -Ev '^\([^)]+\) [^ ]*\$' | grep -Ev '^(export |source |cd |opencode )' | tail -n ${OUTPUT_LINES}`.quiet();
        const capturedOutput = result.text().trim();

        if (!capturedOutput) {
          await log("Empty capture after filtering, skipping");
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

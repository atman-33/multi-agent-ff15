import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

// ─── Production Settings ───
const POLL_INTERVAL_MS = 30_000;        // 30 seconds
const ESCALATION_THRESHOLD_MS = 240_000; // 4 minutes
const COOLDOWN_MS = 300_000;             // 5 minutes

// ─── Debug Settings (uncomment for testing) ───
// const POLL_INTERVAL_MS = 5_000;        // 5 seconds
// const ESCALATION_THRESHOLD_MS = 15_000; // 15 seconds
// const COOLDOWN_MS = 30_000;             // 30 seconds

const ENABLE_LOGGING = false;

const PANE_MAP: Record<string, string> = {
  noctis: "ff15:main.0",
  lunafreya: "ff15:main.1",
  ignis: "ff15:main.2",
  gladiolus: "ff15:main.3",
  prompto: "ff15:main.4",
  iris: "ff15:main.5",
};

const ESCALATION_AGENTS = ["ignis", "gladiolus", "prompto"];

const InboxWatcher: Plugin = async ({ $ }) => {
  const agentId = process.env.AGENT_ID;
  if (!agentId) {
    return {};
  }

  if (agentId !== "noctis") {
    return {};
  }

  let firstUnreadSeen: Record<string, number | null> = {};
  let lastEscalation: Record<string, number> = {};
  let updating = false;

  const log = async (message: string): Promise<void> => {
    if (!ENABLE_LOGGING) return;
    try {
      const timestamp = new Date().toISOString();
      await $`echo "[${timestamp}] inbox-watcher [${agentId}]: ${message}" >> logs/inbox-watcher-${agentId}.log`.quiet();
    } catch {}
  };

  const getUnreadCount = async (targetAgent: string): Promise<number> => {
    try {
      const result = await $`scripts/inbox_read.sh ${targetAgent} --peek`.quiet();
      const match = result.text().match(/^(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    } catch {
      return 0;
    }
  };

  const sendWakeMessage = async (targetAgent: string): Promise<boolean> => {
    const targetPane = PANE_MAP[targetAgent];
    if (!targetPane) return false;
    await log(`[ESCALATE] Sending wake message to ${targetAgent} (${targetPane})...`);
    try {
      await $`tmux send-keys -t ${targetPane} C-u`.quiet();
      await new Promise(resolve => setTimeout(resolve, 50));
      await $`tmux send-keys -t ${targetPane} "You have unread inbox messages. Run: scripts/inbox_read.sh ${targetAgent}"`.quiet();
      await new Promise(resolve => setTimeout(resolve, 50));
      await $`tmux send-keys -t ${targetPane} Enter`.quiet();
      await log(`[ESCALATE] Wake message sent to ${targetAgent}`);
      return true;
    } catch (err) {
      await log(`[ESCALATE] Failed for ${targetAgent}: tmux error - ${err}`);
      return false;
    }
  };

  const logEscalation = async (
    targetAgent: string,
    unreadCount: number,
    elapsedMs: number,
  ): Promise<void> => {
    const timestamp = new Date().toISOString();
    const elapsedSeconds = Math.round(elapsedMs / 1000);
    const entry = `- timestamp: "${timestamp}"\\n  agent: "${targetAgent}"\\n  action: "wake_message"\\n  unread_count: ${unreadCount}\\n  elapsed_seconds: ${elapsedSeconds}`;
    try {
      await $`echo -e ${entry} >> queue/metrics/${targetAgent}_escalation.yaml`.quiet();
    } catch {}
  };

  const checkAndEscalate = async (): Promise<void> => {
    if (updating) return;

    try {
      updating = true;
      const now = Date.now();

      for (const targetAgent of ESCALATION_AGENTS) {
        await log(`[POLL] Checking inbox for ${targetAgent}...`);
        const unreadCount = await getUnreadCount(targetAgent);
        await log(`[POLL] ${targetAgent} unread count: ${unreadCount}`);

        if (unreadCount === 0) {
          firstUnreadSeen[targetAgent] = null;
          continue;
        }

        if (!firstUnreadSeen[targetAgent]) {
          firstUnreadSeen[targetAgent] = now;
          await log(`First unread detected for ${targetAgent} (count: ${unreadCount})`);
          continue;
        }

        const elapsed = now - firstUnreadSeen[targetAgent]!;
        if (elapsed < ESCALATION_THRESHOLD_MS) {
          await log(`${targetAgent}: ${unreadCount} unread, ${Math.round(elapsed / 1000)}s elapsed`);
          continue;
        }

        const lastEsc = lastEscalation[targetAgent] ?? 0;
        if (now - lastEsc < COOLDOWN_MS) {
          await log(`${targetAgent}: Cooldown active (${Math.round((now - lastEsc) / 1000)}s)`);
          continue;
        }

        await log(`Escalating ${targetAgent}: ${unreadCount} unread, ${Math.round(elapsed / 1000)}s elapsed`);
        const success = await sendWakeMessage(targetAgent);
        if (success) {
          lastEscalation[targetAgent] = now;
          await logEscalation(targetAgent, unreadCount, elapsed);
          firstUnreadSeen[targetAgent] = null;
        }
      }
    } finally {
      setTimeout(() => { updating = false; }, 2000);
    }
  };

  const intervalId = setInterval(checkAndEscalate, POLL_INTERVAL_MS);

  await log(`Inbox watcher started (polling: ${POLL_INTERVAL_MS / 1000}s, escalation threshold: ${ESCALATION_THRESHOLD_MS / 1000}s, cooldown: ${COOLDOWN_MS / 1000}s)`);

  void intervalId;

  return {};
};

export default InboxWatcher;

import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

const ESCALATION_AGENTS = ["ignis", "gladiolus", "prompto"];

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
  ignis: "ff15:main.2",
  gladiolus: "ff15:main.3",
  prompto: "ff15:main.4",
};

const InboxWatcher: Plugin = async ({ $ }) => {
  const agentId = process.env.AGENT_ID;
  if (agentId !== "noctis") {
    return {};
  }

  const firstUnreadSeen: Record<string, number> = {};
  const lastEscalation: Record<string, number> = {};

  const log = async (message: string): Promise<void> => {
    if (!ENABLE_LOGGING) return;
    try {
      const timestamp = new Date().toISOString();
      await $`echo "[${timestamp}] inbox-watcher: ${message}" >> logs/inbox-watcher.log`.quiet();
    } catch {}
  };

  const getUnreadCount = async (agent: string): Promise<number> => {
    try {
      const result = await $`scripts/inbox_read.sh ${agent} --peek`.quiet();
      const match = result.text().match(/^(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    } catch {
      return 0;
    }
  };

  const sendWakeMessage = async (agent: string): Promise<boolean> => {
    const pane = PANE_MAP[agent];
    if (!pane) return false;
    try {
      await $`tmux send-keys -t ${pane} "You have unread inbox messages. Run: scripts/inbox_read.sh ${agent}"`.quiet();
      await $`tmux send-keys -t ${pane} Enter`.quiet();
      return true;
    } catch (err) {
      await log(`Escalation failed for ${agent}: tmux error - ${err}`);
      return false;
    }
  };

  const logEscalation = async (
    agent: string,
    unreadCount: number,
    elapsedMs: number,
  ): Promise<void> => {
    const timestamp = new Date().toISOString();
    const elapsedSeconds = Math.round(elapsedMs / 1000);
    const entry = `- timestamp: "${timestamp}"\\n  agent: "${agent}"\\n  action: "wake_message"\\n  unread_count: ${unreadCount}\\n  elapsed_seconds: ${elapsedSeconds}`;
    try {
      await $`echo -e ${entry} >> queue/metrics/${agent}_escalation.yaml`.quiet();
    } catch {}
  };

  const checkAndEscalate = async (): Promise<void> => {
    const now = Date.now();

    for (const agent of ESCALATION_AGENTS) {
      const unreadCount = await getUnreadCount(agent);

      if (unreadCount === 0) {
        delete firstUnreadSeen[agent];
        continue;
      }

      if (!firstUnreadSeen[agent]) {
        firstUnreadSeen[agent] = now;
        await log(`${agent}: First unread detected (count: ${unreadCount})`);
        continue;
      }

      const elapsed = now - firstUnreadSeen[agent];
      if (elapsed < ESCALATION_THRESHOLD_MS) {
        await log(`${agent}: ${unreadCount} unread, ${Math.round(elapsed / 1000)}s elapsed (threshold: ${Math.round(ESCALATION_THRESHOLD_MS / 1000)}s)`);
        continue;
      }

      const lastClear = lastEscalation[agent] ?? 0;
      if (now - lastClear < COOLDOWN_MS) {
        await log(`${agent}: Cooldown active (${Math.round((now - lastClear) / 1000)}s since last escalation, cooldown: ${Math.round(COOLDOWN_MS / 1000)}s)`);
        continue;
      }

      await log(`Escalating ${agent}: ${unreadCount} unread, ${Math.round(elapsed / 1000)}s elapsed`);
      const success = await sendWakeMessage(agent);
      if (success) {
        lastEscalation[agent] = now;
        await logEscalation(agent, unreadCount, elapsed);
        delete firstUnreadSeen[agent];
        await log(`${agent}: Wake message sent successfully`);
      }
    }
  };

  const intervalId = setInterval(checkAndEscalate, POLL_INTERVAL_MS);

  await log(`Inbox watcher started (polling: ${POLL_INTERVAL_MS / 1000}s, escalation threshold: ${ESCALATION_THRESHOLD_MS / 1000}s, cooldown: ${COOLDOWN_MS / 1000}s)`);

  void intervalId;

  return {};
};

export default InboxWatcher;

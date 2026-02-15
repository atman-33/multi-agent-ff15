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

const InboxWatcher: Plugin = async ({ $ }) => {
  const agentId = process.env.AGENT_ID;
  if (!agentId) {
    return {};
  }

  const myPane = PANE_MAP[agentId];
  if (!myPane) {
    return {};
  }

  let firstUnreadSeen: number | null = null;
  let lastEscalation: number = 0;

  const log = async (message: string): Promise<void> => {
    if (!ENABLE_LOGGING) return;
    try {
      const timestamp = new Date().toISOString();
      await $`echo "[${timestamp}] inbox-watcher [${agentId}]: ${message}" >> logs/inbox-watcher-${agentId}.log`.quiet();
    } catch {}
  };

  const getUnreadCount = async (): Promise<number> => {
    try {
      const result = await $`scripts/inbox_read.sh ${agentId} --peek`.quiet();
      const match = result.text().match(/^(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    } catch {
      return 0;
    }
  };

  const sendWakeMessage = async (): Promise<boolean> => {
    try {
      await $`tmux send-keys -t ${myPane} Enter`.quiet();
      await $`tmux send-keys -t ${myPane} "You have unread inbox messages. Run: scripts/inbox_read.sh ${agentId}"`.quiet();
      await $`tmux send-keys -t ${myPane} Enter`.quiet();
      return true;
    } catch (err) {
      await log(`Escalation failed: tmux error - ${err}`);
      return false;
    }
  };

  const logEscalation = async (
    unreadCount: number,
    elapsedMs: number,
  ): Promise<void> => {
    const timestamp = new Date().toISOString();
    const elapsedSeconds = Math.round(elapsedMs / 1000);
    const entry = `- timestamp: "${timestamp}"\\n  agent: "${agentId}"\\n  action: "wake_message"\\n  unread_count: ${unreadCount}\\n  elapsed_seconds: ${elapsedSeconds}`;
    try {
      await $`echo -e ${entry} >> queue/metrics/${agentId}_escalation.yaml`.quiet();
    } catch {}
  };

  const checkAndEscalate = async (): Promise<void> => {
    const now = Date.now();
    const unreadCount = await getUnreadCount();

    if (unreadCount === 0) {
      firstUnreadSeen = null;
      return;
    }

    if (firstUnreadSeen === null) {
      firstUnreadSeen = now;
      await log(`First unread detected (count: ${unreadCount})`);
      return;
    }

    const elapsed = now - firstUnreadSeen;
    if (elapsed < ESCALATION_THRESHOLD_MS) {
      await log(`${unreadCount} unread, ${Math.round(elapsed / 1000)}s elapsed (threshold: ${Math.round(ESCALATION_THRESHOLD_MS / 1000)}s)`);
      return;
    }

    if (now - lastEscalation < COOLDOWN_MS) {
      await log(`Cooldown active (${Math.round((now - lastEscalation) / 1000)}s since last escalation, cooldown: ${Math.round(COOLDOWN_MS / 1000)}s)`);
      return;
    }

    await log(`Escalating: ${unreadCount} unread, ${Math.round(elapsed / 1000)}s elapsed`);
    const success = await sendWakeMessage();
    if (success) {
      lastEscalation = now;
      await logEscalation(unreadCount, elapsed);
      firstUnreadSeen = null;
      await log(`Wake message sent successfully`);
    }
  };

  const intervalId = setInterval(checkAndEscalate, POLL_INTERVAL_MS);

  await log(`Inbox watcher started (polling: ${POLL_INTERVAL_MS / 1000}s, escalation threshold: ${ESCALATION_THRESHOLD_MS / 1000}s, cooldown: ${COOLDOWN_MS / 1000}s)`);

  void intervalId;

  return {};
};

export default InboxWatcher;

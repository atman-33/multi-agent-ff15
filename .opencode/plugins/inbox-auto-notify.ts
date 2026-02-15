import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

const PANE_MAP: Record<string, string> = {
  noctis: "ff15:main.0",
  lunafreya: "ff15:main.1",
  ignis: "ff15:main.2",
  gladiolus: "ff15:main.3",
  prompto: "ff15:main.4",
  iris: "ff15:main.5",
};

const InboxAutoNotify: Plugin = async ({ $ }) => {
  const agentId = process.env.AGENT_ID;
  if (!agentId) {
    return {};
  }

  const ENABLE_LOGGING = false;

  const log = async (message: string): Promise<void> => {
    if (!ENABLE_LOGGING) return;
    try {
      const timestamp = new Date().toISOString();
      await $`echo "[${timestamp}] inbox-auto-notify [${agentId}]: ${message}" >> logs/inbox-auto-notify-${agentId}.log`.quiet();
    } catch {}
  };

  const myInbox = `queue/inbox/${agentId}.yaml`;
  const myPane = PANE_MAP[agentId];

  if (!myPane) {
    await log(`No pane mapping for agent ${agentId}, plugin disabled`);
    return {};
  }

  const notifiedMessageIds = new Set<string>();
  let notifying = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 3000; // Debounce window for file watcher events

  const getLatestUnreadMessageId = async (): Promise<string | null> => {
    try {
      const result = await $`python3 -c "
import yaml, sys
try:
    with open('${myInbox}', 'r') as f:
        data = yaml.safe_load(f) or {}
    messages = data.get('messages', [])
    unread = [m for m in messages if isinstance(m, dict) and not m.get('read', False)]
    if unread:
        unread.sort(key=lambda m: m.get('timestamp', ''), reverse=True)
        print(unread[0].get('id', ''))
except Exception as e:
    sys.stderr.write(str(e))
    sys.exit(1)
"`.quiet();
      const msgId = result.text().trim();
      return msgId || null;
    } catch {
      return null;
    }
  };

  await log(`Inbox auto-notify started (monitoring own inbox: ${myInbox})`);

  return {
    event: async ({ event }) => {
      if (event.type !== "file.watcher.updated") return;

      const props = event.properties as { file: string; event: "add" | "change" | "unlink" };

      if (!props.file.endsWith(myInbox)) {
        await log(`Ignoring file change: ${props.file} (not my inbox)`);
        return;
      }
      // Accept both "add" and "change" events
      // os.rename() atomic writes may emit "add" instead of "change" on Linux/inotify
      if (props.event !== "change" && props.event !== "add") {
        await log(`Ignoring event type: ${props.event}`);
        return;
      }

      await log(`[TRIGGER] Inbox file ${props.event} detected: ${props.file}`);

      // Debounce: A single inbox_write produces multiple file events
      // (os.rename + os.utime). Coalesce them into one notification.
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        await log(`[DEBOUNCE] Reset timer (coalescing rapid events)`);
      }

      debounceTimer = setTimeout(async () => {
        debounceTimer = null;

        if (notifying) {
          await log(`[SKIP] Already notifying`);
          return;
        }

        try {
          notifying = true;
          await log(`[LOCK] Acquired notifying lock`);

          const latestUnreadId = await getLatestUnreadMessageId();
          await log(`[CHECK] Latest unread message ID: ${latestUnreadId}`);

          if (latestUnreadId === null) {
            await log(`[SKIP] No unread messages found`);
            return;
          }

          if (notifiedMessageIds.has(latestUnreadId)) {
            await log(`[SKIP] Already notified for message ${latestUnreadId}`);
            return;
          }

          await log(`[NOTIFY] Sending wake message for new message ${latestUnreadId}`);

          await $`tmux send-keys -t ${myPane} Enter`.quiet();
          await $`tmux send-keys -t ${myPane} "You have new inbox messages. Run: scripts/inbox_read.sh ${agentId}"`.quiet();
          await $`tmux send-keys -t ${myPane} Enter`.quiet();

          notifiedMessageIds.add(latestUnreadId);
          await log(`[SUCCESS] Wake message sent, added ${latestUnreadId} to notified set`);
        } catch (err) {
          await log(`[ERROR] Failed to send wake message: ${err}`);
        } finally {
          notifying = false;
          await log(`[UNLOCK] Released notifying lock`);
        }
      }, 500); // Wait 500ms to coalesce rapid file events
    },
  };
};

export default InboxAutoNotify;

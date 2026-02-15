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

  await log(`Inbox auto-notify started (monitoring own inbox: ${myInbox})`);

  return {
    event: async ({ event }) => {
      if (event.type !== "file.watcher.updated") return;

      const props = event.properties as { file: string; event: "add" | "change" | "unlink" };
      
      if (!props.file.endsWith(myInbox)) return;
      if (props.event !== "change" && props.event !== "add") return;

      await log(`Inbox file changed, notifying via tmux`);

      try {
        await $`tmux send-keys -t ${myPane} Enter`.quiet();
        await $`tmux send-keys -t ${myPane} "You have new inbox messages. Run: scripts/inbox_read.sh ${agentId}"`.quiet();
        await $`tmux send-keys -t ${myPane} Enter`.quiet();
        await log(`Successfully sent wake message via tmux`);
      } catch (err) {
        await log(`Failed to send wake message: ${err}`);
      }
    },
  };
};

export default InboxAutoNotify;

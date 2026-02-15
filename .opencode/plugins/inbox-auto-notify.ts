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
  if (agentId !== "noctis") {
    return {};
  }

  const ENABLE_LOGGING = false;

  const log = async (message: string): Promise<void> => {
    if (!ENABLE_LOGGING) return;
    try {
      const timestamp = new Date().toISOString();
      await $`echo "[${timestamp}] inbox-auto-notify: ${message}" >> logs/inbox-auto-notify.log`.quiet();
    } catch {}
  };

  const extractAgent = (filePath: string): string | undefined => {
    const match = filePath.match(/queue\/inbox\/(\w+)\.yaml$/);
    return match?.[1];
  };

  const isBusy = async (agent: string): Promise<boolean> => {
    try {
      await $`scripts/busy_detect.sh ${agent}`.quiet();
      return false;
    } catch (err: unknown) {
      const exitCode = (err as { exitCode?: number }).exitCode;
      return exitCode === 1;
    }
  };

  await log("Inbox auto-notify started (event-driven, runs on Noctis only)");

  return {
    event: async ({ event }) => {
      if (event.type !== "file.watcher.updated") return;

      const props = event.properties as { file: string; event: "add" | "change" | "unlink" };
      
      if (!props.file.includes("queue/inbox/")) return;
      if (props.file.endsWith(".lock")) return;
      if (props.event !== "change" && props.event !== "add") return;

      const targetAgent = extractAgent(props.file);
      if (!targetAgent) return;

      if (targetAgent === agentId) return;

      const pane = PANE_MAP[targetAgent];
      if (!pane) return;

      const busy = await isBusy(targetAgent);
      if (busy) {
        await log(`Skipped wake for ${targetAgent} (BUSY). Message stays in inbox.`);
        return;
      }

      try {
        await $`tmux send-keys -t ${pane} "You have new inbox messages. Run: scripts/inbox_read.sh ${targetAgent}" Enter`.quiet();
        await log(`Woke ${targetAgent} via tmux (${pane})`);
      } catch (err) {
        await log(`Failed to wake ${targetAgent}: ${err}`);
      }
    },
  };
};

export default InboxAutoNotify;

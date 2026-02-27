import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * Iris Inbox Listener — Context Aggregator.
 * 
 * Listens to all agent inboxes and forwards NON-STANDARD messages to Iris.
 * This ensures Iris stays in the loop for context, discussions, and manual interventions,
 * without overwhelming her with mechanical task updates (which are handled by worklog-updater).
 */
const IrisInboxListener: Plugin = async ({ $ }) => {
  const agentId = process.env.AGENT_ID;
  if (agentId !== "iris") {
    // Only run on Iris to avoid duplicate processing
    return {};
  }

  const TARGET_INBOXES = [
    "queue/inbox/noctis.yaml",
    "queue/inbox/ignis.yaml",
    "queue/inbox/gladiolus.yaml",
    "queue/inbox/prompto.yaml",
    "queue/inbox/lunafreya.yaml"
  ];

  // In-memory cache for this session (will be lost on restart, that's fine for a listener)
  const processedIds = new Set<string>();

  const log = async (message: string): Promise<void> => {
    try {
      const timestamp = new Date().toISOString();
      await $`mkdir -p logs`.quiet();
      await $`echo "[${timestamp}] iris-listener: ${message}" >> logs/iris-listener.log`.quiet();
    } catch { }
  };

  const checkPython = async (): Promise<void> => {
    try {
      await $`python3 --version`.quiet();
    } catch (e) {
      const timestamp = new Date().toISOString();
      await $`echo "[${timestamp}] iris-listener: [ERROR] python3 not available: ${String(e)}" >> logs/iris-listener.log`.quiet();
    }
  };

  const forwardToIris = async (msg: { id: string; type: string; from: string; content: string; }): Promise<void> => {
    try {
      // Escape for shell
      const escapedContent = (msg.content || "").replace(/'/g, "'\\''");
      const summary = `[Forwarded from ${msg.from} (${msg.type})] ${escapedContent}`;

      await log(`Forwarding message ${msg.id} to Iris`);
      // Use inbox_write.sh
      await $`scripts/inbox_write.sh iris listener context_update '${summary}'`.quiet();
    } catch (e) {
      await log(`Failed to forward message: ${e}`);
    }
  };

  await checkPython();
  await log("iris-inbox-listener started");

  return {
    event: async ({ event }) => {
      // Listen for file changes
      if (event.type !== "file.watcher.updated") return;
      const props = event.properties as { file: string; event: "add" | "change"; };
      // Accept both events
      if (props.event !== "change" && props.event !== "add") return;

      const changedFile = props.file;

      // Check if it's one of our target inboxes
      const isTarget = TARGET_INBOXES.some(path => changedFile.endsWith(path));
      if (!isTarget) return;

      await log(`[TRIGGER] Inbox file changed: ${changedFile}`);

      try {
        const result = await $`python3 .opencode/lib/inbox_reader.py ${changedFile} filter-json --types message error luna_instruction skill_candidate`.quiet();
        const messages = JSON.parse(result.text());

        for (const msg of messages) {
          if (!processedIds.has(msg.id)) {
            processedIds.add(msg.id);
            await forwardToIris(msg);
          }
        }
      } catch (e) {
        await log(`Error processing file ${changedFile}: ${e}`);
      }
    },
  };
};

export default IrisInboxListener;

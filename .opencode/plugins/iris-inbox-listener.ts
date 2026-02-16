import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * Iris Inbox Listener — Context Aggregator.
 * 
 * Listens to all agent inboxes and forwards NON-STANDARD messages to Iris.
 * This ensures Iris stays in the loop for context, discussions, and manual interventions,
 * without overwhelming her with mechanical task updates (which are handled by dashboard-auto-updater).
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
  const ENABLE_LOGGING = true;

  const log = async (message: string): Promise<void> => {
    if (!ENABLE_LOGGING) return;
    try {
      const timestamp = new Date().toISOString();
      await $`mkdir -p logs`.quiet();
      await $`echo "[${timestamp}] iris-listener: ${message}" >> logs/iris-listener.log`.quiet();
    } catch { }
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

      try {
        const pythonScript = `
import yaml
import sys
import json

try:
    with open('${changedFile}', 'r') as f:
        data = yaml.safe_load(f) or {}
    
    messages = data.get('messages', [])
    result = []
    
    for m in messages:
        if isinstance(m, dict):
            msg_id = m.get('id', '?')
            msg_type = m.get('type', 'unknown')
            msg_from = m.get('from', '?')
            msg_content = m.get('content', '')
            
            # FILTERING LOGIC
            # INTERESTING TYPES to forward:
            # - message (discussion)
            # - error (problems)
            # - luna_instruction (needs attention)
            # - skill_candidate (needs documenting)
            
            if msg_type in ['message', 'error', 'luna_instruction', 'skill_candidate']:
                result.append({
                    'id': msg_id,
                    'type': msg_type,
                    'from': msg_from,
                    'content': msg_content
                })
                
    print(json.dumps(result))
except Exception:
    print("[]")
`;
        const result = await $`python3 -c "${pythonScript}"`.quiet();
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

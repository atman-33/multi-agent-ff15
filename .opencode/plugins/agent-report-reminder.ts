import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

// ─── Production Settings ───
const IDLE_WAIT_MS = 5_000; // 5 seconds wait after idle as requested

const PANE_MAP: Record<string, string> = {
  noctis: "ff15:main.0",
  lunafreya: "ff15:main.1",
  ignis: "ff15:main.2",
  gladiolus: "ff15:main.3",
  prompto: "ff15:main.4",
  iris: "ff15:main.5",
};

const AgentReportReminder: Plugin = async ({ $, client }) => {
  const agentId = process.env.AGENT_ID;

  // Active only for Ignis, Gladiolus, and Prompto
  if (agentId !== "ignis" && agentId !== "gladiolus" && agentId !== "prompto") {
    return {};
  }

  const log = async (message: string): Promise<void> => {
    try {
      const timestamp = new Date().toISOString();
      await $`mkdir -p logs`.quiet();
      const logMsg = `[${timestamp}] agent-report-reminder (${agentId}): ${message}`;
      await $`printf '%s\n' ${logMsg} >> logs/agent-report-reminder.log`.quiet();
    } catch { }
  };

  let currentSessionId: string | null = null;

  return {
    event: async ({ event }) => {
      // Capture session ID from creation event or other events if possible
      if (event.type === "session.created") {
        const eventAny = event as any;
        const newSessionId =
          eventAny.session_id ||
          eventAny.sessionID ||
          eventAny.sessionId ||
          eventAny.id ||
          eventAny.properties?.session_id ||
          eventAny.properties?.sessionID ||
          eventAny.properties?.sessionId ||
          eventAny.properties?.id;

        if (newSessionId) {
          currentSessionId = newSessionId;
          await log(`Captured session ID: ${newSessionId}`);
        }
      }

      if (event.type !== "session.idle") return;

      await log(`Detected session.idle (currentSessionId: ${currentSessionId}), waiting 10s before report check...`);

      // Wait 10 seconds as requested
      await new Promise(resolve => setTimeout(resolve, IDLE_WAIT_MS));

      try {
        let sessionId = currentSessionId;
        if (!sessionId) {
          const eventAny = event as any;
          sessionId =
            eventAny.session_id ||
            eventAny.sessionID ||
            eventAny.sessionId ||
            eventAny.id ||
            eventAny.properties?.session_id ||
            eventAny.properties?.sessionID ||
            eventAny.properties?.sessionId ||
            eventAny.properties?.id;
        }

        if (!sessionId) {
          try {
            const sessionsResult = await client.session.list();
            if (sessionsResult?.data && Array.isArray(sessionsResult.data) && sessionsResult.data.length > 0) {
              sessionId = sessionsResult.data[0].id;
              await log(`Resolved session ID via list: ${sessionId}`);
            }
          } catch { }
        }

        if (!sessionId) {
          await log("Could not resolve session ID, skipping check.");
          return;
        }

        // Use Python for robust YAML parsing of inbox files
        const pythonScript = `
import yaml
import os
import sys
import re

agent_id = sys.argv[1]
inbox_file = f"queue/inbox/{agent_id}.yaml"
noctis_file = "queue/inbox/noctis.yaml"

if not os.path.exists(inbox_file):
    sys.exit(0)

try:
    with open(inbox_file, 'r') as f:
        inbox_data = yaml.safe_load(f) or {}
except Exception:
    sys.exit(0)

messages = inbox_data.get('messages', [])
latest_task_id = None

# Find the most recent task assigned to this agent
for m in reversed(messages):
    if not isinstance(m, dict): continue
    if m.get('from') == 'noctis' and m.get('type') == 'task_assigned':
        content = m.get('content', '')
        # Simple regex to find task_id in the content content (usually YAML string)
        match = re.search(r'task_id:\\s*"?([\\w-]+)"?', content)
        if match:
            latest_task_id = match.group(1)
            break

if not latest_task_id:
    sys.exit(0)

# Check if a report for this task exists in noctis's inbox
if not os.path.exists(noctis_file):
    print(f"MISSING:{latest_task_id}")
    sys.exit(0)

try:
    with open(noctis_file, 'r') as f:
        noctis_data = yaml.safe_load(f) or {}
except Exception:
    sys.exit(0)

noctis_messages = noctis_data.get('messages', [])
reported = False
for m in noctis_messages:
    if not isinstance(m, dict): continue
    if m.get('from') == agent_id and m.get('type') == 'report_received':
        m_content = m.get('content', '')
        if latest_task_id in m_content:
            reported = True
            break

if not reported:
    print(f"MISSING:{latest_task_id}")
`.trim();

        const result = await $`python3 -c ${pythonScript} ${agentId}`.quiet();
        const output = result.text().trim();
        await log(`Report check result: "${output}"`);

        if (output.startsWith("MISSING:")) {
          const taskId = output.split(":")[1];
          await log(`Report missing for task ${taskId}. Sending status notification to pane.`);

          const reminderMsg = `[SYSTEM] Reminder: You have not yet reported for task ${taskId}. Please send a report to noctis.yaml with type 'report_received'.`;

          // Direct tmux notification to keep inbox clean
          const myPane = PANE_MAP[agentId];
          if (myPane) {
            await $`tmux send-keys -t ${myPane} C-u`.quiet();
            await new Promise(resolve => setTimeout(resolve, 50));
            await $`tmux send-keys -t ${myPane} "${reminderMsg}"`.quiet();
            await new Promise(resolve => setTimeout(resolve, 50));
            await $`tmux send-keys -t ${myPane} Enter`.quiet();
            await log(`Sent tmux reminder to ${myPane}`);
          }
        } else {
          await log("Report found or no task assigned. No action needed.");
        }

      } catch (error) {
        await log(`Error during report check: ${error}`);
      }
    },
  };
};

export default AgentReportReminder;

import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * Iris Watcher — monitors queue/inbox/noctis.yaml for report_received messages.
 * If dashboard is stale after new reports, writes to Iris inbox (auto-notify wakes Iris).
 * Runs on Iris agent only.
 */
const IrisWatcher: Plugin = async ({ $ }) => {
  const agentId = process.env.AGENT_ID;
  if (agentId !== "iris") {
    return {};
  }

  const NOCTIS_INBOX = "queue/inbox/noctis.yaml";
  const DASHBOARD_FILE = "dashboard.md";
  const ENABLE_LOGGING = false;

  const processedReportIds = new Set<string>();
  let lastDashboardMtime = 0;

  const log = async (message: string): Promise<void> => {
    if (!ENABLE_LOGGING) return;
    try {
      const timestamp = new Date().toISOString();
      const logLine = `[${timestamp}] ${message}\n`;
      await $`echo ${logLine} >> logs/iris-watcher.log`.quiet();
    } catch {}
  };

  const getMtime = async (path: string): Promise<number> => {
    try {
      const result = await $`stat -c %Y ${path} 2>/dev/null || echo 0`.quiet();
      return parseInt(result.text().trim(), 10) || 0;
    } catch {
      return 0;
    }
  };

  const getReportMessages = async (): Promise<Array<{ id: string; from: string; read: boolean }>> => {
    try {
      const result = await $`python3 -c "
import yaml, sys
try:
    with open('${NOCTIS_INBOX}', 'r') as f:
        data = yaml.safe_load(f) or {}
    messages = data.get('messages', [])
    for m in messages:
        if isinstance(m, dict) and m.get('type') == 'report_received':
            print(f\"{m.get('id', '?')}|{m.get('from', '?')}|{m.get('read', True)}\")
except Exception:
    pass
"`.quiet();
      const lines = result.text().trim().split("\n").filter(Boolean);
      return lines.map((line) => {
        const [id, from, read] = line.split("|");
        return { id, from, read: read === "True" };
      });
    } catch {
      return [];
    }
  };

  const initProcessed = async (): Promise<void> => {
    const reports = await getReportMessages();
    for (const r of reports) {
      processedReportIds.add(r.id);
    }
    lastDashboardMtime = await getMtime(DASHBOARD_FILE);
    await log(`Iris Watcher initialized (inbox-based). ${processedReportIds.size} existing reports tracked.`);
  };

  await initProcessed();

  return {
    event: async ({ event }) => {
      if (event.type !== "file.watcher.updated") return;

      const props = event.properties as { file: string; event: "add" | "change" | "unlink" };
      const changedFile = props.file;

      const isNoctisInbox = changedFile.endsWith(NOCTIS_INBOX);
      const isDashboard = changedFile.endsWith(DASHBOARD_FILE);

      if (!isNoctisInbox && !isDashboard) return;

      if (isDashboard) {
        const dashboardMtime = await getMtime(DASHBOARD_FILE);
        if (dashboardMtime > lastDashboardMtime) {
          lastDashboardMtime = dashboardMtime;
          await log(`Dashboard updated. Will require new reports to trigger.`);
        }
        return;
      }

      if (isNoctisInbox && props.event === "change") {
        const reports = await getReportMessages();
        const newReports = reports.filter((r) => !processedReportIds.has(r.id));

        if (newReports.length === 0) return;

        for (const r of newReports) {
          processedReportIds.add(r.id);
        }

        const dashboardMtime = await getMtime(DASHBOARD_FILE);
        if (dashboardMtime > lastDashboardMtime) {
          lastDashboardMtime = dashboardMtime;
          await log(`New reports found but dashboard recently updated. Skipping.`);
          return;
        }

        const reporters = newReports.map((r) => r.from).join(", ");
        await log(`New report(s) from: ${reporters}. Dashboard stale. Writing to Iris inbox.`);

        try {
          await $`scripts/inbox_write.sh iris iris-watcher system "Dashboard update needed: report(s) from ${reporters}"`.quiet();
        } catch (err) {
          await log(`Failed to write to Iris inbox: ${err}`);
        }
      }
    },
  };
};

export default IrisWatcher;

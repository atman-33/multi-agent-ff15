import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

const IrisWatcher: Plugin = async ({ $ }) => {
  // Only execute on Iris agent to prevent duplicate notifications
  const agentId = process.env.AGENT_ID;
  if (agentId !== "iris") {
    return {};
  }

  const REPORT_FILES = [
    "queue/reports/ignis_report.yaml",
    "queue/reports/gladiolus_report.yaml",
    "queue/reports/prompto_report.yaml",
  ];
  const DASHBOARD_FILE = "dashboard.md";
  const SEND_SCRIPT = ".opencode/skills/send-message/scripts/send.sh";
  const ENABLE_LOGGING = false;

  let lastReportMtimes: Record<string, number> = {};
  let lastNotifiedMtimes: Record<string, number> = {};
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

  const initMtimes = async (): Promise<void> => {
    for (const file of REPORT_FILES) {
      const mtime = await getMtime(file);
      lastReportMtimes[file] = mtime;
    }
    lastDashboardMtime = await getMtime(DASHBOARD_FILE);
    await log(`Iris Watcher initialized (event-driven). Baseline mtimes: ${JSON.stringify(lastReportMtimes)}`);
  };

  await initMtimes();

  return {
    event: async ({ event }) => {
      if (event.type !== "file.watcher.updated") return;

      const props = event.properties as { file: string; event: "add" | "change" | "unlink" };
      const changedFile = props.file;
      const eventType = props.event;

      const isReportFile = REPORT_FILES.some(f => changedFile.endsWith(f));
      const isDashboard = changedFile.endsWith(DASHBOARD_FILE);

      if (!isReportFile && !isDashboard) return;

      if (isDashboard) {
        const dashboardMtime = await getMtime(DASHBOARD_FILE);
        if (dashboardMtime > lastDashboardMtime) {
          lastDashboardMtime = dashboardMtime;
          lastNotifiedMtimes = {};
          await log(`Dashboard updated. Clearing notification flags.`);
        }
        return;
      }

      if (isReportFile && eventType === "change") {
        const reportMtime = await getMtime(changedFile);
        const previousMtime = lastReportMtimes[changedFile] ?? 0;

        if (reportMtime <= previousMtime) return;

        lastReportMtimes[changedFile] = reportMtime;

        const lastNotified = lastNotifiedMtimes[changedFile] ?? 0;
        if (reportMtime <= lastNotified) return;

        const dashboardMtime = await getMtime(DASHBOARD_FILE);
        if (dashboardMtime > lastDashboardMtime) {
          lastDashboardMtime = dashboardMtime;
          lastNotifiedMtimes = {};
          await log(`Report updated but dashboard also updated. Clearing flags.`);
          return;
        }

        if (reportMtime <= dashboardMtime) return;

        const agentName = changedFile.match(/(\w+)_report\.yaml$/)?.[1] || "unknown";
        await log(`Report updated: ${agentName}. Dashboard stale. Waking Iris.`);

        await $`${SEND_SCRIPT} iris "Report updated: ${agentName}. Check dashboard."`.quiet().catch(async (err: unknown) => {
          await log(`Failed to send message to Iris: ${err}`);
        });

        lastNotifiedMtimes[changedFile] = reportMtime;
        lastDashboardMtime = dashboardMtime;
      }
    },
  };
};

export default IrisWatcher;

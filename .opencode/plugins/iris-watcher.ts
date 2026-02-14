import type { Plugin } from "@opencode-ai/plugin";

// ---------------------------------------------------------------------------
// Iris Watcher Plugin
//
// Polls report files every 30 seconds. When a report is updated but
// dashboard.md has not been updated since the report change, sends a
// wake message to the Iris agent via send-message skill.
// Iris then performs the analysis and notifies Noctis if needed.
//
// Replaces the former iris-dashboard-analyzer plugin with a simpler,
// more controllable design: the plugin only checks timestamps and
// wakes Iris — all analysis logic lives in the Iris agent itself.
// ---------------------------------------------------------------------------

// Configuration: Set to false to disable log writing (useful for debugging)
const ENABLE_LOGGING = false;

const IrisWatcher: Plugin = async ({ $ }) => {
  const POLL_INTERVAL = 30_000; // 30 seconds
  const REPORT_DIR = "queue/reports";
  const REPORT_FILES = [
    "ignis_report.yaml",
    "gladiolus_report.yaml",
    "prompto_report.yaml",
  ];
  const DASHBOARD_FILE = "dashboard.md";
  const SEND_SCRIPT = ".opencode/skills/send-message/scripts/send.sh";

  /** Track last-known modification times (epoch seconds) */
  let lastReportMtimes: Record<string, number> = {};
  let lastDashboardMtime = 0;

  /** Track last notified modification times to prevent duplicate notifications */
  let lastNotifiedMtimes: Record<string, number> = {};

  /** Log to dedicated file for easy debugging */
  const log = async (message: string): Promise<void> => {
    if (!ENABLE_LOGGING) return; // Skip logging if disabled

    try {
      const timestamp = new Date().toISOString();
      const logLine = `[${timestamp}] ${message}\n`;
      await $`echo ${logLine} >> logs/iris-watcher.log`.quiet();
    } catch {
      // Best-effort logging
    }
  };

  /** Get file modification time (epoch seconds). Returns 0 if file not found. */
  const getMtime = async (path: string): Promise<number> => {
    try {
      const result = await $`stat -c %Y ${path} 2>/dev/null || echo 0`.quiet();
      return parseInt(result.text().trim(), 10) || 0;
    } catch {
      return 0;
    }
  };

  /** Initialise baseline modification times */
  const initMtimes = async (): Promise<void> => {
    for (const file of REPORT_FILES) {
      const mtime = await getMtime(`${REPORT_DIR}/${file}`);
      lastReportMtimes[file] = mtime;
    }
    lastDashboardMtime = await getMtime(DASHBOARD_FILE);
    await log(`Baseline mtimes loaded: ${JSON.stringify(lastReportMtimes)}, dashboard=${lastDashboardMtime}`);
  };

  /** Check for report updates and wake Iris if needed */
  const pollReports = async (): Promise<void> => {
    try {
      const dashboardMtime = await getMtime(DASHBOARD_FILE);
      const updatedReports: string[] = [];

      // Check for report updates
      for (const file of REPORT_FILES) {
        const currentMtime = await getMtime(`${REPORT_DIR}/${file}`);
        const previousMtime = lastReportMtimes[file] ?? 0;

        if (currentMtime > previousMtime) {
          // Report was updated
          lastReportMtimes[file] = currentMtime;

          // Only add to notification list if we haven't notified about this version yet
          const lastNotified = lastNotifiedMtimes[file] ?? 0;
          if (currentMtime > lastNotified) {
            updatedReports.push(file.replace("_report.yaml", ""));
          }
        }
      }

      if (updatedReports.length === 0) {
        return; // No new updates to notify about
      }

      // Check if dashboard was updated after reports changed
      if (dashboardMtime > lastDashboardMtime) {
        // Dashboard was updated — Iris likely already handled it
        lastDashboardMtime = dashboardMtime;
        // Clear notification flags so we can notify about future updates
        lastNotifiedMtimes = {};
        await log(`Reports updated (${updatedReports.join(", ")}) but dashboard also updated. Clearing notification flags.`);
        return;
      }

      // Reports updated but dashboard not → wake Iris
      const names = updatedReports.join(", ");
      await log(`Reports updated: ${names}. Dashboard stale. Waking Iris.`);

      await $`${SEND_SCRIPT} iris "Report updated: ${names}. Check dashboard."`.quiet().catch(async (err: unknown) => {
        await log(`Failed to send message to Iris: ${err}`);
      });

      // Mark these reports as notified
      for (const name of updatedReports) {
        const file = `${name}_report.yaml`;
        lastNotifiedMtimes[file] = lastReportMtimes[file];
      }

      lastDashboardMtime = dashboardMtime;
    } catch (error) {
      await log(`Poll error: ${error}`);
    }
  };

  // --- Initialise ---
  await initMtimes();
  await log("Iris Watcher plugin initialized. Polling every 30s.");

  // --- Start periodic polling ---
  const intervalId = setInterval(pollReports, POLL_INTERVAL);

  // Prevent the interval from keeping Node alive when OpenCode shuts down
  if (intervalId && typeof intervalId === "object" && "unref" in intervalId) {
    intervalId.unref();
  }

  // --- Event handler (minimal — the plugin is timer-driven) ---
  return {};
};

export default IrisWatcher;

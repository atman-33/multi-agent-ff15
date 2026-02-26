import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * Dashboard Integrity Checker
 * 
 * Monitors dashboard.md for structural violations (missing/renamed/reordered headers).
 * If a violation is detected, sends an alert to Iris's inbox to request immediate correction.
 */
const DashboardIntegrityChecker: Plugin = async ({ $ }) => {
  const agentId = process.env.AGENT_ID;
  if (agentId !== "iris") {
    // Only run on Iris to avoid duplicate processing
    return {};
  }

  const DASHBOARD_FILE = "dashboard.md";
  const IRIS_INBOX = "queue/inbox/iris.yaml";

  // Expected mandatory headers in order
  const REQUIRED_HEADERS = [
    "## 🚨 Requires Action",
    "## 🔄 In Progress",
    "## ✅ Today's Results",
    "## 🎯 Skill Candidates",
    "## 🛠️ Generated Skills"
  ];

  // Debounce mechanism to prevent duplicate alerts
  // (os.rename() atomic writes trigger multiple file watcher events)
  let lastCheckTime = 0;
  const DEBOUNCE_MS = 1000; // 1 second

  const log = async (message: string): Promise<void> => {
    try {
      const timestamp = new Date().toISOString();
      await $`mkdir -p logs`.quiet();
      await $`echo "[${timestamp}] dashboard-integrity: ${message}" >> logs/dashboard-integrity.log`.quiet();
    } catch { }
  };

  const checkDashboardStructure = async (): Promise<{ valid: boolean; issues: string[]; }> => {
    try {
      const content = await $`cat ${DASHBOARD_FILE}`.text();
      const lines = content.split('\n');

      const issues: string[] = [];
      const foundHeaders: string[] = [];

      // Extract all level-2 headers
      for (const line of lines) {
        if (line.trim().startsWith('## ')) {
          foundHeaders.push(line.trim());
        }
      }

      // Check for missing headers
      for (const required of REQUIRED_HEADERS) {
        if (!foundHeaders.includes(required)) {
          issues.push(`Missing header: "${required}"`);
        }
      }

      // Check for unauthorized headers (strict mode)
      for (const found of foundHeaders) {
        if (!REQUIRED_HEADERS.includes(found)) {
          issues.push(`Unauthorized header: "${found}"`);
        }
      }

      // Check for duplicate headers
      const headerCounts = new Map<string, number>();
      for (const h of foundHeaders) {
        headerCounts.set(h, (headerCounts.get(h) ?? 0) + 1);
      }
      for (const [header, count] of headerCounts) {
        if (count > 1) {
          issues.push(`Duplicate header (${count}x): "${header}"`);
        }
      }

      // Check order (only for headers that exist and are required)
      let lastIndex = -1;
      for (const required of REQUIRED_HEADERS) {
        const currentIndex = foundHeaders.indexOf(required);
        if (currentIndex !== -1) {
          if (currentIndex < lastIndex) {
            issues.push(`Header out of order: "${required}"`);
          }
          lastIndex = currentIndex;
        }
      }

      return {
        valid: issues.length === 0,
        issues
      };
    } catch (e) {
      await log(`Error checking dashboard: ${e}`);
      return { valid: true, issues: [] }; // Assume valid on error to avoid spam
    }
  };

  const alertIris = async (issues: string[]): Promise<void> => {
    const issueList = issues.map(i => `- ${i}`).join('\n');
    const message = `[SYSTEM ALERT] Dashboard structure corrupted!\n\nIssues detected:\n${issueList}\n\nPlease fix the dashboard.md structure immediately by restoring the correct headers and order.`;

    const escapedMessage = message.replace(/'/g, "'\\''");

    try {
      await $`scripts/inbox_write.sh iris system dashboard_integrity_alert '${escapedMessage}'`.quiet();
      await log(`Alert sent to Iris: ${issues.length} issues detected`);
    } catch (e) {
      await log(`Failed to send alert: ${e}`);
    }
  };

  await log("dashboard-integrity-checker started");

  return {
    event: async ({ event }) => {
      // Listen for dashboard.md changes
      if (event.type !== "file.watcher.updated") return;
      const props = event.properties as { file: string; event: "add" | "change"; };

      if (!props.file.endsWith(DASHBOARD_FILE)) return;
      if (props.event !== "change" && props.event !== "add") return;

      // Debounce: skip if called within DEBOUNCE_MS of last check
      const now = Date.now();
      if (now - lastCheckTime < DEBOUNCE_MS) {
        await log("Skipped (debounced)");
        return;
      }
      lastCheckTime = now;

      await log("Dashboard changed, checking structure...");

      const result = await checkDashboardStructure();

      if (!result.valid) {
        await log(`Structure violation detected: ${result.issues.join(", ")}`);
        await alertIris(result.issues);
      } else {
        await log("Structure OK");
      }
    },
  };
};

export default DashboardIntegrityChecker;

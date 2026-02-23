import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { getProjectRoot } from "@/lib/getProjectRoot.server";
import { getClientForAgent } from "@/lib/opencodeClient.server";

import { ALLOWED_AGENTS, AGENT_PANE_INDEX as PANE_INDEX, type ModelSwitchAgent } from "@/lib/agents";

async function clearDirectory(dirPath: string, deleteFiles: boolean = true) {
  try {
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const stat = await fs.stat(fullPath);
      if (stat.isFile() && deleteFiles) {
        await fs.unlink(fullPath);
      } else if (stat.isDirectory()) {
        await clearDirectory(fullPath, true);
        await fs.rmdir(fullPath);
      }
    }
  } catch (e: any) {
    if (e.code !== 'ENOENT') {
      console.error(`Error clearing directory ${dirPath}:`, e);
    }
  }
}

export async function action({ request }: { request: Request; }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const root = getProjectRoot();

    // 1. Clear queues and inboxes
    for (const agent of ALLOWED_AGENTS) {
      // Reset inbox
      const inboxPath = path.join(root, "queue", "inbox", `${agent}.yaml`);
      try {
        await fs.writeFile(inboxPath, "messages: []\n", "utf-8");
      } catch (e) {
        console.error(`Error resetting inbox for ${agent}:`, e);
      }
    }

    // Delete escalation metrics
    try {
      const metricsDir = path.join(root, "queue", "metrics");
      const metricFiles = await fs.readdir(metricsDir).catch(() => []);
      for (const file of metricFiles) {
        if (file.endsWith("_escalation.yaml")) {
          await fs.unlink(path.join(metricsDir, file));
        }
      }
    } catch (e) {
      console.error("Error clearing metrics:", e);
    }

    // Clear tasks and reports directories
    await clearDirectory(path.join(root, "queue", "tasks"));
    await clearDirectory(path.join(root, "queue", "reports"));

    // Delete inter-agent queues
    const queuesToDelete = [
      "lunafreya_to_noctis.yaml",
      "noctis_to_lunafreya.yaml",
      "noctis_to_ignis.yaml"
    ];
    for (const q of queuesToDelete) {
      try {
        await fs.unlink(path.join(root, "queue", q));
      } catch (e: any) {
        if (e.code !== 'ENOENT') console.error(`Error deleting ${q}:`, e);
      }
    }

    // 2. Clear runtime logs
    const logsDir = path.join(root, "runtime", "logs");
    try {
      const logFiles = await fs.readdir(logsDir).catch(() => []);
      for (const file of logFiles) {
        if (file.endsWith(".jsonl")) {
          // just empty the file, don't delete to avoid breaking watchers
          await fs.writeFile(path.join(logsDir, file), "", "utf-8");
        }
      }
    } catch (e) {
      console.error("Error clearing log files:", e);
    }

    // 3. Reset dashboard.md
    try {
      const timestamp = new Date().toLocaleString("sv").replace("T", " ").substring(0, 16);
      const dashboardContent = `# 📊 Mission Status
Last Updated: ${timestamp}

## 🚨 Requires Action
None

## 🔄 In Progress
None

## ✅ Today's Results
| Time | Agent | Mission | Result |
|------|-------|---------|--------|

## 🎯 Skill Candidates
None

## 🛠️ Generated Skills
None
`;
      await fs.writeFile(path.join(root, "dashboard.md"), dashboardContent, "utf-8");
    } catch (e) {
      console.error("Error resetting dashboard:", e);
    }

    // 4. Force new sessions on all agents via tmux and opencode SDK
    const timestampMs = Date.now();
    for (const agent of ALLOWED_AGENTS) {
      const client = getClientForAgent(agent);
      if (client) {
        const sessionId = `Session ${agent} ${timestampMs}`;
        try {
          const res = await client.session.create({
            query: { directory: root },
            body: { title: sessionId }
          });

          if (!res.error) {
            await client.tui.openSessions();
            const pane = PANE_INDEX[agent as ModelSwitchAgent];
            if (pane !== undefined) {
              const target = `ff15:main.${pane}`;
              await new Promise(resolve => setTimeout(resolve, 300));
              spawnSync("tmux", ["send-keys", "-t", target, sessionId], { encoding: "utf-8", timeout: 2000 });
              await new Promise(resolve => setTimeout(resolve, 100));
              spawnSync("tmux", ["send-keys", "-t", target, "Enter"], { encoding: "utf-8", timeout: 2000 });
            }
          }
        } catch (e) {
          console.error(`Error creating session for ${agent}:`, e);
        }
      }
    }

    await new Promise(resolve => setTimeout(resolve, 300));

    return Response.json({ ok: true });
  } catch (e) {
    console.error("Session clear all error:", e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

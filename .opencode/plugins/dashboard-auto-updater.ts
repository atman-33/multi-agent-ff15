import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * Dashboard Auto Updater — Independent dashboard automation.
 *
 * Automatically updates mechanical sections of dashboard.md based on inbox activity.
 * - Path A: Inbox file monitoring (task_assigned → In Progress / report_received → Today's Results)
 * - Path B: noctis_idle_capture in Iris inbox → handled by Iris agent (not this plugin)
 */
const DashboardAutoUpdater: Plugin = async ({ $ }) => {
  const agentId = process.env.AGENT_ID;
  // Run on any agent, typically Iris or Noctis, but it's independent.
  // Ideally run on a dedicated 'system' or 'iris' budget.
  if (agentId !== "iris") {
    return {};
  }

  const NOCTIS_INBOX = "queue/inbox/noctis.yaml";
  const IRIS_INBOX = "queue/inbox/iris.yaml";
  const COMRADE_INBOXES: Record<string, string> = {
    ignis: "queue/inbox/ignis.yaml",
    gladiolus: "queue/inbox/gladiolus.yaml",
    prompto: "queue/inbox/prompto.yaml",
  };
  const DASHBOARD_FILE = "dashboard.md";
  const SETTINGS_FILE = "config/settings.yaml";
  const ENABLE_LOGGING = false;

  const processedReportIds = new Set<string>();
  const processedTaskIds = new Set<string>();
  const processedLunaInstructionIds = new Set<string>();
  let updating = false;

  // ─── Helpers ───

  const log = async (message: string): Promise<void> => {
    if (!ENABLE_LOGGING) return;
    try {
      const timestamp = new Date().toISOString();
      const logLine = `[${timestamp}] iris-watcher: ${message}\n`;
      await $`echo ${logLine} >> logs/iris-watcher.log`.quiet();
    } catch { }
  };

  // Language setting removed - dashboard is now English-only

  const readDashboard = async (): Promise<string> => {
    try {
      const result = await $`cat ${DASHBOARD_FILE}`.quiet();
      return result.text();
    } catch {
      return "";
    }
  };

  const writeDashboard = async (content: string): Promise<void> => {
    try {
      const tmpFile = `${DASHBOARD_FILE}.tmp`;
      await $`python3 -c "
import sys, os
content = sys.argv[1]
tmp = sys.argv[2]
target = sys.argv[3]
with open(tmp, 'w') as f:
    f.write(content)
os.rename(tmp, target)
" ${content} ${tmpFile} ${DASHBOARD_FILE}`.quiet();
    } catch (err) {
      await log(`Failed to write dashboard: ${err}`);
    }
  };

  const getCurrentTime = async (): Promise<string> => {
    try {
      const result = await $`date "+%Y-%m-%d %H:%M"`.quiet();
      return result.text().trim();
    } catch {
      return new Date().toISOString().slice(0, 16).replace("T", " ");
    }
  };

  // ─── Inbox Parsers ───

  const getReportMessages = async (): Promise<
    Array<{ id: string; from: string; status: string; summary: string; taskId: string; }>
  > => {
    try {
      const result = await $`python3 -c "
import yaml
try:
    with open('${NOCTIS_INBOX}', 'r') as f:
        data = yaml.safe_load(f) or {}
    messages = data.get('messages', [])
    for m in messages:
        if isinstance(m, dict) and m.get('type') == 'report_received':
            content = m.get('content', '')
            status = 'done'
            summary = ''
            task_id = ''
            for line in content.split('\\n'):
                line = line.strip()
                if line.startswith('status:'):
                    status = line.split(':', 1)[1].strip()
                elif line.startswith('summary:'):
                    summary = line.split(':', 1)[1].strip().strip('\"')
                elif line.startswith('task_id:'):
                    task_id = line.split(':', 1)[1].strip().strip('\"')
            print(f\"{m.get('id', '?')}~{m.get('from', '?')}~{status}~{summary}~{task_id}\")
except Exception:
    pass
"`.quiet();
      const lines = result.text().trim().split("\n").filter(Boolean);
      return lines.map((line) => {
        const parts = line.split("~");
        return {
          id: parts[0] || "?",
          from: parts[1] || "?",
          status: parts[2] || "done",
          summary: parts[3] || "Task completed",
          taskId: parts[4] || "",
        };
      });
    } catch {
      return [];
    }
  };

  const getTaskMessages = async (): Promise<
    Array<{ id: string; agent: string; description: string; taskId: string; }>
  > => {
    const allTasks: Array<{ id: string; agent: string; description: string; taskId: string; }> = [];
    for (const [agent, inboxPath] of Object.entries(COMRADE_INBOXES)) {
      try {
        const result = await $`python3 -c "
import yaml
try:
    with open('${inboxPath}', 'r') as f:
        data = yaml.safe_load(f) or {}
    messages = data.get('messages', [])
    for m in messages:
        if isinstance(m, dict) and m.get('type') == 'task_assigned':
            content = m.get('content', '')
            description = ''
            task_id = ''
            for line in content.split('\\n'):
                line = line.strip()
                if line.startswith('description:'):
                    description = line.split(':', 1)[1].strip().strip('\"')
                elif line.startswith('task_id:'):
                    task_id = line.split(':', 1)[1].strip().strip('\"')
            print(f\"{m.get('id', '?')}~{description}~{task_id}\")
except Exception:
    pass
"`.quiet();
        const lines = result.text().trim().split("\n").filter(Boolean);
        for (const line of lines) {
          const [msgId, description, taskId] = line.split("~");
          allTasks.push({
            id: msgId || "?",
            agent,
            description: description || "",
            taskId: taskId || "",
          });
        }
      } catch {
        continue;
      }
    }
    return allTasks;
  };

  const getLunaInstructionMessages = async (): Promise<
    Array<{ id: string; content: string; }>
  > => {
    try {
      const result = await $`python3 -c "
import yaml
try:
    with open('${NOCTIS_INBOX}', 'r') as f:
        data = yaml.safe_load(f) or {}
    messages = data.get('messages', [])
    for m in messages:
        if isinstance(m, dict) and m.get('from') == 'lunafreya' and m.get('type') in ('message', 'luna_instruction'):
            content = m.get('content', '')
            print(f\"{m.get('id', '?')}~{content}\")
except Exception:
    pass
"`.quiet();
      const lines = result.text().trim().split("\n").filter(Boolean);
      return lines.map((line) => {
        const parts = line.split("~");
        return {
          id: parts[0] || "?",
          content: parts[1] || "",
        };
      });
    } catch {
      return [];
    }
  };

  // ─── Dashboard Section Updaters ───

  const updateInProgress = (
    dashboard: string,
    agent: string,
    description: string,
  ): string => {
    const agentCap = agent.charAt(0).toUpperCase() + agent.slice(1);
    const newRow = `| ${agentCap} | ${description} |`;
    const lines = dashboard.split("\n");
    const sectionIdx = lines.findIndex((l) => l.startsWith("## 🔄 In Progress"));
    if (sectionIdx === -1) return dashboard;

    let nextIdx = lines.length;
    for (let i = sectionIdx + 1; i < lines.length; i++) {
      if (lines[i].startsWith("## ")) { nextIdx = i; break; }
    }

    const sectionContent = lines.slice(sectionIdx + 1, nextIdx);
    const hasTable = sectionContent.some((l) => l.startsWith("| "));

    if (!hasTable) {
      const tableHeader = "| Agent | Task |\n|-------|------|";
      const newSection = [lines[sectionIdx], tableHeader, newRow, ""];
      lines.splice(sectionIdx, nextIdx - sectionIdx, ...newSection);
    } else {
      let insertAt = nextIdx;
      while (insertAt > sectionIdx && lines[insertAt - 1].trim() === "") insertAt--;
      lines.splice(insertAt, 0, newRow);
    }
    return lines.join("\n");
  };

  const removeFromInProgress = (dashboard: string, agent: string): string => {
    const agentCap = agent.charAt(0).toUpperCase() + agent.slice(1);
    const agentLower = agent.toLowerCase();
    const lines = dashboard.split("\n");
    const sectionIdx = lines.findIndex((l) => l.startsWith("## 🔄 In Progress"));
    if (sectionIdx === -1) return dashboard;

    let nextIdx = lines.length;
    for (let i = sectionIdx + 1; i < lines.length; i++) {
      if (lines[i].startsWith("## ")) { nextIdx = i; break; }
    }

    const filtered = lines.filter((line, idx) => {
      if (idx <= sectionIdx || idx >= nextIdx) return true;
      if (line.startsWith(`| ${agentCap} `) || line.toLowerCase().startsWith(`| ${agentLower} `)) return false;
      return true;
    });

    const newSectionIdx = filtered.findIndex((l) => l.startsWith("## 🔄 In Progress"));
    let newNextIdx = filtered.length;
    for (let i = newSectionIdx + 1; i < filtered.length; i++) {
      if (filtered[i].startsWith("## ")) { newNextIdx = i; break; }
    }

    const dataRows = filtered
      .slice(newSectionIdx + 1, newNextIdx)
      .filter((l) =>
        l.startsWith("| ") &&
        !l.startsWith("|--") &&
        !l.startsWith("| Agent"),
      );

    if (dataRows.length === 0) {
      const header = filtered[newSectionIdx];
      filtered.splice(newSectionIdx, newNextIdx - newSectionIdx, header, "None", "");
    }

    return filtered.join("\n");
  };

  const addToTodaysResults = (
    dashboard: string,
    agent: string,
    status: string,
    summary: string,
    time: string,
  ): string => {
    const agentCap = agent.charAt(0).toUpperCase() + agent.slice(1);
    const statusIcon = status === "done" ? "✅" : "❌";
    const resultText = `${statusIcon} ${summary}`;
    const newRow = `| ${time} | ${agentCap} | - | ${resultText} |`;

    const lines = dashboard.split("\n");
    const sectionIdx = lines.findIndex((l) => l.startsWith("## ✅ Today's Results"));
    if (sectionIdx === -1) return dashboard;

    let nextIdx = lines.length;
    for (let i = sectionIdx + 1; i < lines.length; i++) {
      if (lines[i].startsWith("## ")) { nextIdx = i; break; }
    }

    // Find table header separator (|---|) and insert after it
    let insertAt = -1;
    for (let i = sectionIdx + 1; i < nextIdx; i++) {
      if (lines[i].trim().startsWith("|--")) {
        insertAt = i + 1;
        break;
      }
    }

    // If no table header found, insert at end of section (fallback)
    if (insertAt === -1) {
      insertAt = nextIdx;
      while (insertAt > sectionIdx && lines[insertAt - 1].trim() === "") insertAt--;
    }

    lines.splice(insertAt, 0, newRow);

    return lines.join("\n");
  };

  const addToRequiresAction = (
    dashboard: string,
    instruction: string,
  ): string => {
    const prefix = "Instruction from Lunafreya:";
    const newItem = `- ${prefix} ${instruction}`;

    const lines = dashboard.split("\n");
    const sectionIdx = lines.findIndex((l) => l.startsWith("## 🚨 Requires Action"));
    if (sectionIdx === -1) return dashboard;

    let nextIdx = lines.length;
    for (let i = sectionIdx + 1; i < lines.length; i++) {
      if (lines[i].startsWith("## ")) { nextIdx = i; break; }
    }

    const sectionContent = lines.slice(sectionIdx + 1, nextIdx).join("\n");
    if (sectionContent.includes(instruction)) {
      return dashboard;
    }

    let insertAt = nextIdx;
    while (insertAt > sectionIdx && lines[insertAt - 1].trim() === "") insertAt--;
    lines.splice(insertAt, 0, newItem);

    return lines.join("\n");
  };

  const updateTimestamp = (dashboard: string, time: string): string => {
    return dashboard.replace(/^Last Updated:.*$/m, `Last Updated: ${time}`);
  };

  // ─── Initialization ───

  const initProcessed = async (): Promise<void> => {
    const reports = await getReportMessages();
    for (const r of reports) processedReportIds.add(r.id);
    const tasks = await getTaskMessages();
    for (const t of tasks) processedTaskIds.add(t.id);
    const lunaInstructions = await getLunaInstructionMessages();
    for (const li of lunaInstructions) processedLunaInstructionIds.add(li.id);
    await log(`Iris Watcher initialized. ${processedReportIds.size} reports, ${processedTaskIds.size} tasks, ${processedLunaInstructionIds.size} luna instructions tracked.`);
  };

  await initProcessed();

  // ─── Event Handler ───

  return {
    event: async ({ event }) => {
      if (event.type !== "file.watcher.updated") return;

      const props = event.properties as { file: string; event: "add" | "change" | "unlink"; };
      // Accept both "add" and "change" events
      // os.rename() atomic writes may emit "add" instead of "change" on Linux/inotify
      if (props.event !== "change" && props.event !== "add") return;

      if (updating) return;

      const changedFile = props.file;
      const isNoctisInbox = changedFile.endsWith(NOCTIS_INBOX);
      const isComradeInbox = Object.values(COMRADE_INBOXES).some((p) => changedFile.endsWith(p));
      const isIrisInbox = changedFile.endsWith(IRIS_INBOX);

      if (!isNoctisInbox && !isComradeInbox && !isIrisInbox) return;

      try {
        updating = true;
        const now = await getCurrentTime();

        if (isComradeInbox) {
          const tasks = await getTaskMessages();
          const newTasks = tasks.filter((t) => !processedTaskIds.has(t.id));
          if (newTasks.length === 0) return;

          let dashboard = await readDashboard();
          for (const task of newTasks) {
            processedTaskIds.add(task.id);
            dashboard = updateInProgress(dashboard, task.agent, task.description);
            await log(`In Progress added: ${task.agent} - ${task.description}`);
          }
          dashboard = updateTimestamp(dashboard, now);
          await writeDashboard(dashboard);
          return;
        }

        if (isNoctisInbox) {
          const reports = await getReportMessages();
          const newReports = reports.filter((r) => !processedReportIds.has(r.id));

          const lunaInstructions = await getLunaInstructionMessages();
          const newLunaInstructions = lunaInstructions.filter(
            (li) => !processedLunaInstructionIds.has(li.id),
          );

          if (newReports.length === 0 && newLunaInstructions.length === 0) return;

          let dashboard = await readDashboard();

          for (const report of newReports) {
            processedReportIds.add(report.id);
            dashboard = removeFromInProgress(dashboard, report.from);
            dashboard = addToTodaysResults(
              dashboard, report.from, report.status, report.summary, now,
            );
            await log(`Results added: ${report.from} - ${report.status} - ${report.summary}`);
          }

          for (const li of newLunaInstructions) {
            processedLunaInstructionIds.add(li.id);
            dashboard = addToRequiresAction(dashboard, li.content);
            await log(`Requires Action added: Lunafreya instruction - ${li.content}`);
          }

          dashboard = updateTimestamp(dashboard, now);
          await writeDashboard(dashboard);
          return;
        }

        if (isIrisInbox) {
          await log("Iris inbox changed — noctis_idle_capture will be processed by Iris agent");
        }
      } finally {
        setTimeout(() => { updating = false; }, 2000);
      }
    },
  };
};

export default DashboardAutoUpdater;

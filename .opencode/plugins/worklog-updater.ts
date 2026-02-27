import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * Worklog Updater — Automatic task progress tracking.
 *
 * Monitors inbox activity and updates runtime/worklog.json:
 * - task_assigned in Comrade inbox → add to inProgress
 * - report received in Noctis inbox → move from inProgress to results
 * - Luna instruction in Noctis inbox → forward to Crystal inbox as notification
 */
const WorklogUpdater: Plugin = async ({ $ }) => {
  const agentId = process.env.AGENT_ID;
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
  const WORKLOG_FILE = "runtime/worklog.json";
  const processedReportIds = new Set<string>();
  const processedTaskIds = new Set<string>();
  const processedLunaInstructionIds = new Set<string>();
  let updating = false;

  // ─── Helpers ───

  const log = async (message: string): Promise<void> => {
    try {
      const timestamp = new Date().toISOString();
      const logLine = `[${timestamp}] worklog-updater: ${message}\n`;
      await $`echo ${logLine} >> logs/worklog-updater.log`.quiet();
    } catch { }
  };

  const checkPython = async (): Promise<void> => {
    try {
      await $`python3 --version`.quiet();
    } catch (e) {
      const timestamp = new Date().toISOString();
      await $`echo "[${timestamp}] worklog-updater: [ERROR] python3 not available: ${String(e)}" >> logs/worklog-updater.log`.quiet();
    }
  };

  // ─── Worklog Helpers ───

  interface WorklogEntry {
    agent: string;
    taskId: string;
    description?: string;
    summary?: string;
    status?: string;
    timestamp: string;
  }

  interface WorklogData {
    inProgress: WorklogEntry[];
    results: WorklogEntry[];
  }

  const readWorklog = async (): Promise<WorklogData> => {
    try {
      const result = await $`cat ${WORKLOG_FILE}`.quiet();
      return JSON.parse(result.text()) as WorklogData;
    } catch {
      return { inProgress: [], results: [] };
    }
  };

  const writeWorklog = async (data: WorklogData): Promise<void> => {
    try {
      const json = JSON.stringify(data, null, 2);
      const tmpFile = `${WORKLOG_FILE}.tmp`;
      await $`echo ${json} > ${tmpFile} && mv ${tmpFile} ${WORKLOG_FILE}`.quiet();
    } catch (err) {
      await log(`Failed to write worklog: ${err}`);
    }
  };

  // ─── Inbox Parsers ───

  const getReportMessages = async (): Promise<
    Array<{ id: string; from: string; status: string; summary: string; taskId: string; }>
  > => {
    try {
      const result = await $`python3 .opencode/lib/inbox_reader.py ${NOCTIS_INBOX} report-fields`.quiet();
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
        const result = await $`python3 .opencode/lib/inbox_reader.py ${inboxPath} task-fields`.quiet();
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
      const result = await $`python3 .opencode/lib/inbox_reader.py ${NOCTIS_INBOX} luna-fields`.quiet();
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

  // ─── Initialization ───

  const initProcessed = async (): Promise<void> => {
    const reports = await getReportMessages();
    for (const r of reports) processedReportIds.add(r.id);
    const tasks = await getTaskMessages();
    for (const t of tasks) processedTaskIds.add(t.id);
    const lunaInstructions = await getLunaInstructionMessages();
    for (const li of lunaInstructions) processedLunaInstructionIds.add(li.id);
    await log(`Worklog Updater initialized. ${processedReportIds.size} reports, ${processedTaskIds.size} tasks, ${processedLunaInstructionIds.size} luna instructions tracked.`);
  };

  await checkPython();
  await initProcessed();

  // ─── Event Handler ───

  return {
    event: async ({ event }) => {
      if (event.type !== "file.watcher.updated") return;

      const props = event.properties as { file: string; event: "add" | "change" | "unlink"; };
      if (props.event !== "change" && props.event !== "add") return;

      if (updating) return;

      const changedFile = props.file;
      const isNoctisInbox = changedFile.endsWith(NOCTIS_INBOX);
      const isComradeInbox = Object.values(COMRADE_INBOXES).some((p) => changedFile.endsWith(p));
      const isIrisInbox = changedFile.endsWith(IRIS_INBOX);

      if (!isNoctisInbox && !isComradeInbox && !isIrisInbox) return;

      await log(`[TRIGGER] Inbox file changed: ${changedFile}`);

      try {
        updating = true;

        if (isComradeInbox) {
          const tasks = await getTaskMessages();
          const newTasks = tasks.filter((t) => !processedTaskIds.has(t.id));
          if (newTasks.length === 0) return;

          const worklog = await readWorklog();
          const isoNow = new Date().toISOString();
          for (const task of newTasks) {
            processedTaskIds.add(task.id);
            worklog.inProgress.push({
              agent: task.agent,
              taskId: task.taskId,
              description: task.description,
              timestamp: isoNow,
            });
            await log(`In Progress added: ${task.agent} - ${task.description}`);
          }
          await writeWorklog(worklog);
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

          const worklog = await readWorklog();
          const isoNow = new Date().toISOString();

          for (const report of newReports) {
            processedReportIds.add(report.id);
            worklog.inProgress = worklog.inProgress.filter(
              (e) => !(e.agent === report.from && (e.taskId === report.taskId || !report.taskId)),
            );
            worklog.results.push({
              agent: report.from,
              taskId: report.taskId,
              summary: report.summary,
              status: report.status,
              timestamp: isoNow,
            });
            await log(`Results added: ${report.from} - ${report.status} - ${report.summary}`);
          }

          for (const li of newLunaInstructions) {
            processedLunaInstructionIds.add(li.id);
            // Forward Luna instructions to Crystal inbox as notifications
            try {
              await $`scripts/inbox_write.sh crystal system luna_instruction '${li.content.replace(/'/g, "'\\''")}'`.quiet();
              await log(`Luna instruction forwarded to Crystal inbox: ${li.content}`);
            } catch (err) {
              await log(`Failed to forward Luna instruction: ${err}`);
            }
          }

          await writeWorklog(worklog);
          return;
        }

        if (isIrisInbox) {
          await log("Iris inbox changed — agent_idle_capture will be processed by Iris agent");
        }
      } finally {
        setTimeout(() => { updating = false; }, 2000);
      }
    },
  };
};

export default WorklogUpdater;

import type { Plugin } from "@opencode-ai/plugin"

// ---------------------------------------------------------------------------
// Iris Dashboard Analyzer Plugin
//
// Monitors todo completions and comrade report file updates.
// When triggered, invokes the Iris subagent (mode: subagent, hidden: true)
// to analyze dashboard.md and reports, then Iris sends a concise,
// actionable notification to Noctis — saving Noctis's context window.
//
// Key design decisions:
//   - File I/O uses `$` shell (Bun shell helper), NOT client.file.read()
//   - Subagent invocation uses client.session.prompt() with correct params
//   - Session ID comes from event.properties, NOT process.env
//   - file.watcher.updated has singular `file` + `event` properties (SDK type)
// ---------------------------------------------------------------------------

export const DashboardUpdateReminder: Plugin = async ({ client, $, directory }) => {
  let lastReminderTime = 0
  const REMINDER_COOLDOWN = 5000 // 5 seconds (prevents burst from rapid event firing)
  let languageSetting = "ja"

  // --- helpers -------------------------------------------------------------

  /** Read language setting from config/settings.yaml via shell */
  const loadLanguageSetting = async (): Promise<void> => {
    try {
      const result = await $`cat config/settings.yaml 2>/dev/null || echo "language: ja"`
      const text = result.text()
      const match = /language:\s*(\w+)/.exec(text)
      if (match) {
        languageSetting = match[1]
      }
    } catch {
      languageSetting = "ja"
    }
  }

  /** Cooldown guard – returns true when enough time has passed */
  const shouldRemind = (): boolean => {
    const now = Date.now()
    if (now - lastReminderTime < REMINDER_COOLDOWN) {
      return false
    }
    lastReminderTime = now
    return true
  }

  /** Read a file via shell, return its content or empty string */
  const readFileViaShell = async (path: string): Promise<string> => {
    try {
      const result = await $`cat ${path} 2>/dev/null`
      return result.text().trim()
    } catch {
      return ""
    }
  }

  /** Invoke Iris subagent to analyze dashboard + reports and notify Noctis */
  const invokeIrisAnalysis = async (
    sessionID: string,
    completedTodos?: string[],
    reportName?: string
  ): Promise<void> => {
    try {
      // Collect context for Iris
      const dashboardContent = await readFileViaShell("dashboard.md")
      const reportContents: string[] = []
      const reportNames = reportName
        ? [reportName]
        : ["ignis", "gladiolus", "prompto"]

      for (const name of reportNames) {
        const content = await readFileViaShell(`queue/reports/${name}_report.yaml`)
        if (content) {
          reportContents.push(`--- ${name}_report.yaml ---\n${content}`)
        }
      }

      // Build user prompt for Iris
      let userPrompt = `Dashboard Analysis Request:\n\n`
      userPrompt += `Current Dashboard:\n${dashboardContent}\n\n`

      if (completedTodos && completedTodos.length > 0) {
        userPrompt += `Completed Todos (not yet in dashboard):\n${completedTodos.join(", ")}\n\n`
      }

      if (reportContents.length > 0) {
        userPrompt += `Reports:\n${reportContents.join("\n\n")}\n\n`
      }

      userPrompt += languageSetting === "ja"
        ? `上記を分析し、dashboard.md の更新が必要かどうか判断してください。必要であれば、Noctis に具体的な更新内容を 2-3 文で報告してください。不要であれば「更新不要」と報告してください。`
        : `Analyze the above and determine if dashboard.md needs updating. If yes, report specific update recommendations to Noctis in 2-3 sentences. If no updates needed, respond with "No update needed".`

      // Invoke Iris subagent via client.session.prompt()
      await client.session.prompt({
        path: { id: sessionID },
        body: {
          agent: "iris",
          model: { providerID: "github-copilot", modelID: "gpt-5-mini" },
          parts: [{ type: "text", text: userPrompt }],
        },
        query: { directory },
      })

      await client.app.log({
        body: {
          service: "iris-analyzer",
          level: "info",
          message: `Iris analysis invoked for session ${sessionID}`,
        },
      })
    } catch (error) {
      // Fallback: send a simple tmux notification if Iris invocation fails
      await sendFallbackNotification(completedTodos, reportName)

      await client.app.log({
        body: {
          service: "iris-analyzer",
          level: "error",
          message: `Failed to invoke Iris: ${error}. Sent fallback notification.`,
        },
      })
    }
  }

  /** Fallback notification via tmux when Iris invocation fails */
  const sendFallbackNotification = async (
    completedTodos?: string[],
    reportName?: string
  ): Promise<void> => {
    try {
      const parts: string[] = []

      if (completedTodos && completedTodos.length > 0) {
        parts.push(
          languageSetting === "ja"
            ? `完了: ${completedTodos.join(", ")}`
            : `Completed: ${completedTodos.join(", ")}`
        )
      }
      if (reportName) {
        parts.push(
          languageSetting === "ja"
            ? `${reportName} から新しい報告`
            : `New report from ${reportName}`
        )
      }

      const summary = parts.length > 0 ? parts.join(" | ") : "Dashboard update needed"
      const footer = languageSetting === "ja"
        ? "dashboard.md を確認してください"
        : "Please check dashboard.md"

      const message = `⚠️ [Dashboard Reminder] ${summary} — ${footer}`
      await $`tmux send-keys -t ff15:main.0 ${message} Enter`.catch(() => {})
    } catch {
      // Best-effort, ignore errors
    }
  }

  // --- initialise (non-blocking, best-effort) ------------------------------
  await loadLanguageSetting()

  // --- event handler -------------------------------------------------------
  return {
    event: async ({ event }: { event: { type: string; properties?: Record<string, unknown> } }) => {
      if (!shouldRemind()) return

      // --- Todo completion ---------------------------------------------------
      // SDK type: EventTodoUpdated { sessionID: string; todos: Todo[] }
      if (event.type === "todo.updated" && event.properties?.todos) {
        const sessionID = event.properties.sessionID as string | undefined
        if (!sessionID) return

        const todos = event.properties.todos as Array<{ status: string; content: string }>
        const completedTodos = todos.filter((t) => t.status === "completed")
        const inProgressTodos = todos.filter((t) => t.status === "in_progress")

        if (completedTodos.length > 0 && inProgressTodos.length === 0) {
          const items = completedTodos.map((t) => t.content)
          await invokeIrisAnalysis(sessionID, items)
        }
      }

      // --- Comrade report file change ----------------------------------------
      // SDK type: EventFileWatcherUpdated { file: string; event: "add"|"change"|"unlink" }
      if (event.type === "file.watcher.updated" && event.properties?.file) {
        const filePath = event.properties.file as string
        const fileEvent = event.properties.event as string

        // Only trigger on add/change of report YAML files
        if (
          (fileEvent === "add" || fileEvent === "change") &&
          filePath.includes("queue/reports/") &&
          filePath.endsWith("_report.yaml")
        ) {
          const match = filePath.match(/(\w+)_report\.yaml$/)
          const reportName = match ? match[1] : "unknown"

          // file.watcher.updated doesn't carry sessionID — use session.list to find active
          try {
            const sessions = await client.session.list()
            const sessionList = (sessions as any)?.data ?? sessions
            if (Array.isArray(sessionList) && sessionList.length > 0) {
              // Use the most recently updated session
              const sorted = [...sessionList].sort(
                (a: any, b: any) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0)
              )
              const activeSessionID = sorted[0]?.id
              if (activeSessionID) {
                await invokeIrisAnalysis(activeSessionID, undefined, reportName)
              }
            }
          } catch {
            // Fallback if session.list fails
            await sendFallbackNotification(undefined, reportName)
          }
        }
      }
    },
  }
}

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

const DashboardUpdateReminder: Plugin = async ({ client, $, directory }) => {
  let lastReminderTime = 0
  const REMINDER_COOLDOWN = 5000 // 5 seconds (prevents burst from rapid event firing)
  let languageSetting = "ja"

  // --- helpers -------------------------------------------------------------

  /** Log to dedicated file for easy debugging */
  const log = async (message: string): Promise<void> => {
    try {
      const timestamp = new Date().toISOString()
      const logLine = `[${timestamp}] ${message}\n`
      await $`echo ${logLine} >> logs/iris-plugin.log`
    } catch {
      // Best-effort logging, ignore errors
    }
  }

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
      await log(`Invoking Iris analysis for session ${sessionID}`)
      
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

      await log(`Calling client.session.prompt with agent: iris`)
      
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

      await log(`Iris analysis successfully invoked`)
      
      await client.app.log({
        body: {
          service: "iris-analyzer",
          level: "info",
          message: `Iris analysis invoked for session ${sessionID}`,
        },
      })
    } catch (error) {
      await log(`Error invoking Iris: ${error}`)
      
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
  await log(`Plugin initialized, language: ${languageSetting}`)

  // --- event handlers ------------------------------------------------------
  return {
    "todo.updated": async ({ sessionID, todos }: { sessionID: string; todos: Array<{ status: string; content: string }> }) => {
      await log(`todo.updated event fired, sessionID: ${sessionID}, todos count: ${todos.length}`)
      
      if (!shouldRemind()) {
        await log("Cooldown active, skipping reminder")
        return
      }

      const completedTodos = todos.filter((t) => t.status === "completed")
      await log(`Completed todos count: ${completedTodos.length}`)

      if (completedTodos.length > 0) {
        const items = completedTodos.map((t) => t.content)
        await invokeIrisAnalysis(sessionID, items)
      }
    },

    // --- tool.execute.after hook for report file writes + todowrite ----------------------
    "tool.execute.after": async (input, output) => {
      await log(`tool.execute.after event fired, tool: ${input.tool}`)
      
      if (!shouldRemind()) {
        await log("Cooldown active, skipping tool check")
        return
      }

      const { tool, args } = input

      // Handle todowrite tool
      if (tool === "todowrite") {
        await log("todowrite detected, analyzing todos")
        try {
          const todos = (args as any).todos as Array<{ status: string; content: string }> | undefined
          if (todos) {
            const completedTodos = todos.filter((t) => t.status === "completed")
            await log(`Completed todos count: ${completedTodos.length}`)
            if (completedTodos.length > 0) {
              await log("Fetching session list...")
              const sessions = await client.session.list()
              const sessionList = (sessions as any)?.data ?? sessions
              await log(`Session list length: ${Array.isArray(sessionList) ? sessionList.length : 'not array'}`)
              
              if (Array.isArray(sessionList) && sessionList.length > 0) {
                const sorted = [...sessionList].sort(
                  (a: any, b: any) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0)
                )
                const activeSessionID = sorted[0]?.id
                await log(`Active session ID: ${activeSessionID}`)
                
                if (activeSessionID) {
                  const items = completedTodos.map((t) => t.content)
                  await invokeIrisAnalysis(activeSessionID, items)
                } else {
                  await log("No active session ID found")
                }
              } else {
                await log("No active sessions found")
              }
            }
          }
        } catch (error) {
          await log(`Error handling todowrite: ${error}`)
        }
        return
      }

      // Handle report file writes
      if (tool !== "write" && tool !== "edit") {
        await log("Tool not write/edit, ignoring")
        return
      }

      const filePath = args.filePath as string | undefined
      await log(`Checking filePath: ${filePath}`)
      if (!filePath) {
        await log("No filePath found, returning")
        return
      }

      // Normalize path - handle both absolute and relative paths
      const normalizedPath = filePath.includes("queue/reports/")
        ? filePath.substring(filePath.indexOf("queue/reports/"))
        : filePath.replace(/^\.?\//, "")
      
      await log(`Normalized path: ${normalizedPath}`)
      
      if (
        normalizedPath.startsWith("queue/reports/") &&
        normalizedPath.endsWith("_report.yaml")
      ) {
        await log("Report file detected, extracting name")
        const match = normalizedPath.match(/(\w+)_report\.yaml$/)
        const reportName = match ? match[1] : "unknown"
        await log(`Report name: ${reportName}`)

        try {
          await log("Fetching session list for report trigger")
          const sessions = await client.session.list()
          const sessionList = (sessions as any)?.data ?? sessions
          await log(`Session list retrieved: ${Array.isArray(sessionList) ? sessionList.length : 'not array'}`)
          
          if (Array.isArray(sessionList) && sessionList.length > 0) {
            const sorted = [...sessionList].sort(
              (a: any, b: any) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0)
            )
            const activeSessionID = sorted[0]?.id
            await log(`Active session ID for report: ${activeSessionID}`)
            
            if (activeSessionID) {
              await invokeIrisAnalysis(activeSessionID, undefined, reportName)
            } else {
              await log("No active session ID, cannot invoke Iris")
            }
          } else {
            await log("No sessions found, cannot invoke Iris")
          }
        } catch (error) {
          await log(`Error in report trigger: ${error}`)
          await sendFallbackNotification(undefined, reportName)
        }
      } else {
        await log("File path does not match report pattern, ignoring")
      }
    },
  }
}

export default DashboardUpdateReminder

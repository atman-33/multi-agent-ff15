import type { Plugin } from "@opencode-ai/plugin"

interface TodoItem {
  status: string
  content: string
}

interface TodoUpdatedInput {
  todos?: TodoItem[]
}

interface FileWatcherInput {
  files?: Array<{ path: string }>
}

export const DashboardUpdateReminder: Plugin = async ({ client }) => {
  let lastReminderTime = 0
  const REMINDER_COOLDOWN = 60000

  const shouldRemind = (): boolean => {
    const now = Date.now()
    if (now - lastReminderTime < REMINDER_COOLDOWN) {
      return false
    }
    lastReminderTime = now
    return true
  }

  const logReminder = async (message: string, extra?: Record<string, unknown>) => {
    await client.app.log({
      body: {
        service: "dashboard-reminder",
        level: "warn",
        message: `⚠️ DASHBOARD UPDATE REMINDER: ${message}`,
        extra,
      },
    })
    
    console.log(`\n${"=".repeat(60)}`)
    console.log(`⚠️  DASHBOARD UPDATE REMINDER`)
    console.log(`${"=".repeat(60)}`)
    console.log(message)
    if (extra) {
      console.log(`Extra: ${JSON.stringify(extra, null, 2)}`)
    }
    console.log(`${"=".repeat(60)}\n`)
  }

  return {
    event: async ({ event }: { event: { type: string } }) => {
      if (event.type === "session.idle" && shouldRemind()) {
        await logReminder(
          "Session idle detected. Update dashboard.md:\n" +
          "1. Move completed tasks to '✅ 本日の成果'\n" +
          "2. Update '最終更新' timestamp\n" +
          "3. Clear '🚨 対応必要' if resolved\n" +
          "4. Add results in descending order"
        )
      }
    },

    "todo.updated": async (input: TodoUpdatedInput) => {
      const completedTodos = input.todos?.filter((t: TodoItem) => t.status === "completed") || []
      const inProgressTodos = input.todos?.filter((t: TodoItem) => t.status === "in_progress") || []

      if (completedTodos.length > 0 && inProgressTodos.length === 0 && shouldRemind()) {
        const items = completedTodos.map((t: TodoItem) => t.content).join(", ")
        await logReminder(
          `${completedTodos.length} todo(s) completed: ${items}\n` +
          "Add these to '✅ 本日の成果' section in dashboard.md",
          { completedCount: completedTodos.length }
        )
      }
    },

    "file.watcher.updated": async (input: FileWatcherInput) => {
      const changedFiles = input.files || []
      const reportFiles = changedFiles.filter((f: { path: string }) => 
        f.path.includes("queue/reports/") && f.path.endsWith("_report.yaml")
      )

      if (reportFiles.length > 0 && shouldRemind()) {
        const reportNames = reportFiles.map((f: { path: string }) => {
          const match = f.path.match(/(\w+)_report\.yaml$/)
          return match ? match[1] : "unknown"
        })

        await logReminder(
          `New reports from: ${reportNames.join(", ")}\n` +
          `Check files: ${reportFiles.map((f: { path: string }) => f.path).join(", ")}\n` +
          "Review and update dashboard.md",
          { reports: reportNames }
        )
      }
    },
  }
}

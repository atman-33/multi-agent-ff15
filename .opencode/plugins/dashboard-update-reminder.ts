import type { Plugin } from "@opencode-ai/plugin"
import type { Event } from "@opencode-ai/sdk"

export const DashboardUpdateReminder: Plugin = async ({ client, $ }) => {
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

  const sendDirectNotification = async (message: string) => {
    try {
      const escapedMessage = message.replace(/'/g, "'\\''")
      await $`tmux send-keys -t ff15:0 ${escapedMessage}`
      await $`tmux send-keys -t ff15:0 Enter`

      await client.app.log({
        body: {
          service: "dashboard-reminder",
          level: "info",
          message: `Notification sent to Noctis: ${message}`,
        },
      })
    } catch (error) {
      await client.app.log({
        body: {
          service: "dashboard-reminder",
          level: "error",
          message: `Failed to send notification: ${error}`,
        },
      })
    }
  }

  return {
    event: async ({ event }: { event: Event }) => {
      if (!shouldRemind()) return

      const e = event as Event & {
        properties?: {
          todos?: Array<{ status: string; content: string }>
          files?: Array<{ path: string }>
        }
      }

      if (e.type === "todo.updated" && e.properties?.todos) {
        const completedTodos = e.properties.todos.filter((t) => t.status === "completed")
        const inProgressTodos = e.properties.todos.filter((t) => t.status === "in_progress")

        if (completedTodos.length > 0 && inProgressTodos.length === 0) {
          const items = completedTodos.map((t) => t.content).join(", ")
          await sendDirectNotification(
            `⚠️ [Dashboard Reminder] ${completedTodos.length} todo(s) completed: ${items} — Please update dashboard.md`
          )
        }
      }

      if (e.type === "file.watcher.updated" && e.properties?.files) {
        const reportFiles = e.properties.files.filter(
          (f) => f.path.includes("queue/reports/") && f.path.endsWith("_report.yaml")
        )

        if (reportFiles.length > 0) {
          const reportNames = reportFiles.map((f) => {
            const match = f.path.match(/(\w+)_report\.yaml$/)
            return match ? match[1] : "unknown"
          })

          await sendDirectNotification(
            `⚠️ [Dashboard Reminder] New report(s) from: ${reportNames.join(", ")} — Please update dashboard.md`
          )
        }
      }
    },
  }
}

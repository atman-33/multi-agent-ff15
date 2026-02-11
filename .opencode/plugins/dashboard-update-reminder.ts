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

interface Notification {
  id: string
  timestamp: string
  service: string
  message: string
  priority: "low" | "high"
  status: "pending"
  extra?: Record<string, unknown>
}

export const DashboardUpdateReminder: Plugin = async ({ client, $ }) => {
  let lastReminderTime = 0
  const REMINDER_COOLDOWN = 60000
  const NOTIFICATION_FILE = "queue/plugin_notifications.yaml"
  let notificationCounter = 0

  const shouldRemind = (): boolean => {
    const now = Date.now()
    if (now - lastReminderTime < REMINDER_COOLDOWN) {
      return false
    }
    lastReminderTime = now
    return true
  }

  const getCurrentTimestamp = (): string => {
    return new Date().toISOString().slice(0, 19)
  }

  const writeNotificationYAML = async (
    message: string,
    priority: "low" | "high",
    extra?: Record<string, unknown>
  ) => {
    const notification: Notification = {
      id: `notif_${String(++notificationCounter).padStart(3, "0")}`,
      timestamp: getCurrentTimestamp(),
      service: "dashboard-reminder",
      message,
      priority,
      status: "pending",
      ...(extra && { extra }),
    }

    // Build YAML manually (simple structure, no complex nesting)
    let yamlEntry = `  - id: ${notification.id}
    timestamp: "${notification.timestamp}"
    service: ${notification.service}
    message: |
      ${notification.message.split('\n').join('\n      ')}
    priority: ${notification.priority}
    status: ${notification.status}`
    
    if (extra) {
      yamlEntry += `\n    extra:\n${Object.entries(extra).map(([k, v]) => `      ${k}: ${JSON.stringify(v)}`).join('\n')}`
    }

    try {
      const exists = await $`test -f ${NOTIFICATION_FILE}`.nothrow()
      
      if (exists.exitCode === 0) {
        // Append to existing file
        await $`echo "${yamlEntry}" >> ${NOTIFICATION_FILE}`
      } else {
        // Create new file with header
        const yamlContent = `notifications:\n${yamlEntry}\n`
        await $`echo "${yamlContent}" > ${NOTIFICATION_FILE}`
      }
    } catch (error) {
      // Fallback: create new file
      const yamlContent = `notifications:\n${yamlEntry}\n`
      await $`echo "${yamlContent}" > ${NOTIFICATION_FILE}`
    }

    await client.app.log({
      body: {
        service: "dashboard-reminder",
        level: priority === "high" ? "warn" : "info",
        message: `Notification written: ${message}`,
        extra: { id: notification.id, priority },
      },
    })
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
          message: `Direct notification sent to Noctis: ${message}`,
        },
      })
    } catch (error) {
      await client.app.log({
        body: {
          service: "dashboard-reminder",
          level: "error",
          message: `Failed to send direct notification: ${error}`,
        },
      })
    }
  }

  const notifyNoctis = async (
    message: string,
    priority: "low" | "high",
    extra?: Record<string, unknown>
  ) => {
    await writeNotificationYAML(message, priority, extra)

    if (priority === "high") {
      await sendDirectNotification(
        `⚠️ [Dashboard Update Reminder] ${message}`
      )
    }
  }

  return {
    event: async ({ event }: { event: { type: string } }) => {
      if (event.type === "session.idle" && shouldRemind()) {
        await notifyNoctis(
          "Session is idle. Please update dashboard.md:\n" +
          "1. Move completed tasks to '✅ Today's Results'\n" +
          "2. Update 'Last Updated' timestamp\n" +
          "3. Clear '🚨 Requires Action' if resolved\n" +
          "4. Add new achievements in chronological order",
          "low"
        )
      }
    },

    "todo.updated": async (input: TodoUpdatedInput) => {
      const completedTodos = input.todos?.filter((t: TodoItem) => t.status === "completed") || []
      const inProgressTodos = input.todos?.filter((t: TodoItem) => t.status === "in_progress") || []

      if (completedTodos.length > 0 && inProgressTodos.length === 0 && shouldRemind()) {
        const items = completedTodos.map((t: TodoItem) => t.content).join(", ")
        await notifyNoctis(
          `${completedTodos.length} todo(s) completed: ${items}\n` +
          "Please add to '✅ Today's Results' section in dashboard.md",
          "high",
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

        await notifyNoctis(
          `New report(s) received: ${reportNames.join(", ")}\n` +
          `Files: ${reportFiles.map((f: { path: string }) => f.path).join(", ")}\n` +
          "Please update dashboard.md",
          "high",
          { reports: reportNames }
        )
      }
    },
  }
}

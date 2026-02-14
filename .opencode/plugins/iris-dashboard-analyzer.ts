import type { Plugin } from "@opencode-ai/plugin"
import type { Event } from "@opencode-ai/sdk"

declare const process: {
  env: Record<string, string | undefined>
  cwd(): string
}

export const DashboardUpdateReminder: Plugin = async ({ client, $ }) => {
  let lastReminderTime = 0
  const REMINDER_COOLDOWN = 30000

  const shouldRemind = (): boolean => {
    const now = Date.now()
    if (now - lastReminderTime < REMINDER_COOLDOWN) {
      return false
    }
    lastReminderTime = now
    return true
  }

  const readDashboard = async (): Promise<string> => {
    try {
      const response = await client.file.read({ 
        query: { path: "dashboard.md" }
      })
      const fileResponse = (response as any)?.data
      if (fileResponse && fileResponse.content) {
        return fileResponse.content
      }
      return "Dashboard file not found"
    } catch (error) {
      return `Error reading dashboard: ${error}`
    }
  }

   const readReports = async (): Promise<string[]> => {
     try {
       const result: string[] = []
       const reportNames = ["ignis", "gladiolus", "prompto"]
       for (const name of reportNames) {
         try {
           const reportPath = `queue/reports/${name}_report.yaml`
           const response = await client.file.read({ 
             query: { path: reportPath }
           })
           const fileResponse = (response as any)?.data
           if (fileResponse && fileResponse.content) {
             const content = fileResponse.content
             result.push(`${name}_report.yaml:\n${content}`)
           }
         } catch (e) {
         }
       }
       return result
     } catch (error) {
       return [`Error reading reports: ${error}`]
     }
   }

   const invokeIrisSubagent = async (
     completedTodos?: string[],
     newReports?: string[]
   ): Promise<void> => {
     try {
       const dashboardContent = await readDashboard()
       const reportContents = await readReports()

      const systemPrompt = `You are Iris, a dashboard analysis assistant. Analyze the current dashboard state and report content.

Dashboard state may show incomplete information. Reports exist that contain new task completions or agent updates. Your job is to:
1. Identify what sections of dashboard.md need updating
2. Summarize which reports are new/unprocessed
3. Generate a brief, actionable summary for Noctis

Keep the summary to 2-3 sentences maximum. Be direct and specific.`

      let userPrompt = `Dashboard Analysis Request:\n\nCurrent Dashboard:\n${dashboardContent}\n\n`

      if (completedTodos && completedTodos.length > 0) {
        userPrompt += `Completed Todos (not yet in dashboard):\n${completedTodos.join(", ")}\n\n`
      }

      if (newReports && newReports.length > 0) {
        userPrompt += `New Reports:\n${reportContents.join("\n---\n")}\n\n`
      }

      userPrompt += `Please analyze and provide a concise summary of what dashboard updates are needed.`

      const response = await client.session.prompt({
        body: {
          agent: "iris",
          system: systemPrompt,
          parts: [{ type: "text", text: userPrompt }],
        },
        path: { id: process.env.OPENCODE_SESSION_ID || "default" },
      })

      const promptResponse = (response as any)?.data
      const textParts = promptResponse?.parts?.filter((p: any) => p.type === "text") || []
      const summary = textParts.length > 0 
        ? textParts[0].text 
        : "Dashboard update analysis complete"

      await sendIrisNotification(summary)

      await client.app.log({
        body: {
          service: "iris-analyzer",
          level: "info",
          message: `Iris analysis: ${summary}`,
        },
      })
    } catch (error) {
      await client.app.log({
        body: {
          service: "iris-analyzer",
          level: "error",
          message: `Failed to invoke Iris subagent: ${error}`,
        },
      })
    }
  }

  const sendIrisNotification = async (summary: string) => {
    try {
      const notification = `🔔 [DASHBOARD UPDATE] Iris Analysis:\n${summary}`
      const escapedMessage = notification.replace(/'/g, "'\\''")

      if ($) {
        await $`tmux send-keys -t ff15:0 '${escapedMessage}'`
        await $`tmux send-keys -t ff15:0 Enter`
      }

      await client.app.log({
        body: {
          service: "iris-analyzer",
          level: "info",
          message: `Notification sent to Noctis via Iris`,
        },
      })
    } catch (error) {
      await client.app.log({
        body: {
          service: "iris-analyzer",
          level: "error",
          message: `Failed to send Iris notification: ${error}`,
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
          const items = completedTodos.map((t) => t.content)
          await invokeIrisSubagent(items)
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
          await invokeIrisSubagent(undefined, reportNames)
        }
      }
    },
  }
}

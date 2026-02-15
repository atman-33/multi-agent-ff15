import type { Plugin } from "@opencode-ai/plugin"

declare const process: {
  env: Record<string, string | undefined>
}

const DEPRECATED_PATHS = [
  "queue/tasks/",
  "queue/reports/",
  "queue/lunafreya_to_noctis.yaml",
  "queue/noctis_to_lunafreya.yaml",
]

export const YamlWriteValidator: Plugin = async ({ client, $ }) => {
  let resolvedAgentId: string | undefined = process.env.AGENT_ID
  if (!resolvedAgentId) {
    try {
      const result = await $`tmux display-message -t "$TMUX_PANE" -p '#{@agent_id}' 2>/dev/null`
      const id = result.text().trim()
      if (id && id !== "") resolvedAgentId = id
    } catch {}
  }

  return {
    "tool.execute.before": async (input, output) => {
      const { tool } = input
      const { args } = output

      if (tool !== "write" && tool !== "edit") return

      const filePath = args.filePath as string | undefined
      if (!filePath) return

      const agentId = resolvedAgentId
      if (!agentId) return

      const normalizedPath = filePath.replace(/^\.?\//, "")
      const validationErrors: string[] = []

      const inboxSelfMatch = normalizedPath.match(/^queue\/inbox\/(\w+)\.yaml$/)
      if (inboxSelfMatch && inboxSelfMatch[1] === agentId) {
        validationErrors.push(
          `❌ INBOX SELF-WRITE BLOCKED (${agentId})\n` +
          "\n" +
          `You are trying to write to your OWN inbox: queue/inbox/${agentId}.yaml\n` +
          "\n" +
          "Agents must NOT write to their own inbox.\n" +
          "Use messaging scripts to send messages to OTHER agents' inboxes:\n" +
          "  scripts/send_task.sh <agent> \"<description>\"  (Noctis → Comrade)\n" +
          "  scripts/send_report.sh \"<task_id>\" \"<status>\" \"<summary>\"  (Comrade → Noctis)\n" +
          "  scripts/luna_to_noctis.sh \"<description>\"  (Luna → Noctis)\n" +
          "  scripts/noctis_to_luna.sh \"<description>\"  (Noctis → Luna)\n"
        )
      }

      for (const deprecated of DEPRECATED_PATHS) {
        if (normalizedPath.startsWith(deprecated) || normalizedPath === deprecated.replace(/\/$/, "")) {
          validationErrors.push(
            `❌ DEPRECATED PATH (${agentId})\n` +
            "\n" +
            `Writing to '${normalizedPath}' is no longer supported.\n` +
            "\n" +
            "The inbox system (queue/inbox/) is the sole communication channel.\n" +
            "Use the appropriate messaging script instead:\n" +
            "  scripts/send_task.sh, scripts/send_report.sh,\n" +
            "  scripts/luna_to_noctis.sh, scripts/noctis_to_luna.sh\n"
          )
          break
        }
      }

      if (validationErrors.length > 0) {
        await client.app.log({
          body: {
            service: "yaml-write-validator",
            level: "error",
            message: `Blocked invalid write attempt: ${normalizedPath} by ${agentId}`,
          },
        })
        throw new Error(validationErrors.join("\n"))
      }
    },
  }
}

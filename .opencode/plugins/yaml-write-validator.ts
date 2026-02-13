import type { Plugin } from "@opencode-ai/plugin"

declare const process: {
  env: Record<string, string | undefined>
}

export const YamlWriteValidator: Plugin = async ({ client }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const { tool } = input
      const { args } = output

      if (tool !== "write" && tool !== "edit") {
        return
      }

      const filePath = args.filePath as string | undefined
      if (!filePath) {
        return
      }

      const agentId = process.env.AGENT_ID
      if (!agentId) {
        return
      }

      const normalizedPath = filePath.replace(/^\.?\//, "")
      const validationErrors: string[] = []

      if (agentId === "noctis") {
        if (normalizedPath === "queue/lunafreya_to_noctis.yaml") {
          validationErrors.push(
            "❌ FILE DIRECTION ERROR (Noctis)\n" +
            "\n" +
            "You are trying to WRITE to your INCOMING file.\n" +
            "\n" +
            "File naming: sender_to_receiver.yaml\n" +
            "  • lunafreya_TO_noctis = Luna sends TO you (INCOMING = you READ)\n" +
            "  • noctis_TO_lunafreya = You send TO Luna (OUTGOING = you WRITE)\n" +
            "\n" +
            "Correct action:\n" +
            "  READ from:  queue/lunafreya_to_noctis.yaml (Luna → You)\n" +
            "  WRITE to:   queue/noctis_to_lunafreya.yaml (You → Luna)\n"
          )
        }
      }

      if (agentId === "lunafreya") {
        if (normalizedPath === "queue/noctis_to_lunafreya.yaml") {
          validationErrors.push(
            "❌ FILE DIRECTION ERROR (Lunafreya)\n" +
            "\n" +
            "You are trying to WRITE to your INCOMING file.\n" +
            "\n" +
            "File naming: sender_to_receiver.yaml\n" +
            "  • noctis_TO_lunafreya = Noctis sends TO you (INCOMING = you READ)\n" +
            "  • lunafreya_TO_noctis = You send TO Noctis (OUTGOING = you WRITE)\n" +
            "\n" +
            "Correct action:\n" +
            "  READ from:  queue/noctis_to_lunafreya.yaml (Noctis → You)\n" +
            "  WRITE to:   queue/lunafreya_to_noctis.yaml (You → Noctis)\n"
          )
        }
      }

      const comrades = ["ignis", "gladiolus", "prompto"]
      if (comrades.includes(agentId)) {
        if (
          normalizedPath === "queue/lunafreya_to_noctis.yaml" ||
          normalizedPath === "queue/noctis_to_lunafreya.yaml"
        ) {
          validationErrors.push(
            `❌ UNAUTHORIZED CHANNEL ACCESS (${agentId})\n` +
            "\n" +
            "You are trying to write to Noctis ↔ Lunafreya coordination channel.\n" +
            "\n" +
            "Comrades should NOT write to these files:\n" +
            "  • queue/lunafreya_to_noctis.yaml (Luna → Noctis only)\n" +
            "  • queue/noctis_to_lunafreya.yaml (Noctis → Luna only)\n" +
            "\n" +
            "Your communication channels:\n" +
            `  WRITE to:   queue/reports/${agentId}_report.yaml (your report to Noctis)\n` +
            `  READ from:  queue/tasks/${agentId}.yaml (tasks from Noctis)\n`
          )
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

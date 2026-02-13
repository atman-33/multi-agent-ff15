---
name: send-report
description: Report task completion from Comrades (Ignis, Gladiolus, Prompto) to Noctis with automated YAML generation and timestamping. Use when a Comrade completes a task and needs to report results. Automatically detects agent ID, generates timestamp, writes to queue/reports/{agent}_report.yaml, and wakes Noctis via send-message.
metadata:
  author: multi-agent-ff15
  version: "1.0"
  created: "2026-02-14"
---

# send-report

Report task completion to Noctis with automated YAML generation and notification.

## Usage

Run the script from anywhere in the repository:

```bash
.opencode/skills/send-report/scripts/send_report.sh "<task_id>" "<status>" "<summary>" [details] [skill_candidate]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `task_id` | Yes | Task ID from original assignment (e.g., `task_1707878400`) |
| `status` | Yes | Completion status: `done` or `failed` |
| `summary` | Yes | 1-2 sentence summary of results (quote if contains spaces) |
| `details` | No | Detailed results (multiline supported with `\n`) |
| `skill_candidate` | No | Skill name if reusable pattern discovered (default: `null`) |

### Examples

**Basic completion report:**
```bash
.opencode/skills/send-report/scripts/send_report.sh "task_1707878400" "done" "Analysis completed successfully"
```

**With details:**
```bash
.opencode/skills/send-report/scripts/send_report.sh "task_1707878401" "done" "Feature implemented" "Added OAuth support\nTested with 3 providers"
```

**With skill candidate:**
```bash
.opencode/skills/send-report/scripts/send_report.sh "task_1707878402" "done" "Pattern discovered" "OAuth integration is reusable across projects" "oauth-integration"
```

**Failure report:**
```bash
.opencode/skills/send-report/scripts/send_report.sh "task_1707878403" "failed" "Dependency missing" "Required library not available in environment"
```

## What It Does

1. **Auto-detects** agent ID from tmux pane (`@agent_id`)
2. **Validates** status (must be `done` or `failed`)
3. **Generates** ISO 8601 timestamp automatically
4. **Writes** YAML to `queue/reports/{agent_id}_report.yaml` with structure:
   ```yaml
   report:
     task_id: "task_1707878400"
     status: done
     summary: "Analysis completed successfully"
     details: |
       Detailed results here
       Multiple lines supported
     skill_candidate: null
     timestamp: "2026-02-14T15:30:00"
   ```
5. **Wakes** Noctis via send-message skill

## Benefits

- **No manual YAML writing** — Script handles all formatting
- **No agent ID confusion** — Automatically detects your identity
- **No timestamp errors** — Automatically generates correct ISO 8601 format
- **No typos** — Structured generation prevents field name mistakes
- **Atomic operation** — YAML write + Noctis wake in single call
- **Context efficient** — Replaces ~150 tokens of manual YAML creation with ~30 tokens

## Output

```
✅ Report submitted by ignis (task_1707878400)
Sent to noctis (ff15:main.0)
```

## For Comrades Only

This skill is designed exclusively for Comrades (Ignis, Gladiolus, Prompto) to report task completion to Noctis. Noctis should never use this skill — he assigns tasks via `/send-task` instead.

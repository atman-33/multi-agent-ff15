---
name: send-task
description: Assign tasks to Comrades (Ignis, Gladiolus, Prompto) with automated YAML generation and timestamping. Use when Noctis needs to delegate work to Comrades. Automatically generates task_id, timestamp, writes to queue/tasks/{agent}.yaml, and wakes the target agent via send-message.
metadata:
  author: multi-agent-ff15
  version: "1.0"
  created: "2026-02-14"
---

# send-task

Assign tasks to Comrades with automated YAML generation and agent notification.

## Usage

Run the script from anywhere in the repository:

```bash
.opencode/skills/send-task/scripts/send_task.sh <agent_name> "<description>" [target_path] [parent_cmd]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `agent_name` | Yes | Target Comrade: `ignis`, `gladiolus`, or `prompto` |
| `description` | Yes | Task description (quote if contains spaces) |
| `target_path` | No | File/directory path for task (default: `null`) |
| `parent_cmd` | No | Parent command ID for task tracking (default: `null`) |

### Examples

**Basic task assignment:**
```bash
.opencode/skills/send-task/scripts/send_task.sh ignis "Analyze YAML communication patterns"
```

**With target path:**
```bash
.opencode/skills/send-task/scripts/send_task.sh gladiolus "Implement feature X" "/home/atman/repos/multi-agent-ff15"
```

**With parent command:**
```bash
.opencode/skills/send-task/scripts/send_task.sh prompto "Quick recon of dependencies" "/path/to/project" "cmd_001"
```

## What It Does

1. **Validates** agent name (must be ignis, gladiolus, or prompto)
2. **Generates** unique `task_id` (format: `task_<unix_timestamp>`)
3. **Generates** ISO 8601 timestamp automatically
4. **Writes** YAML to `queue/tasks/{agent_name}.yaml` with structure:
   ```yaml
   task:
     task_id: task_1707878400
     parent_cmd: null
     description: "Task description"
     target_path: null
     status: assigned
     timestamp: "2026-02-14T15:30:00"
   ```
5. **Wakes** target agent via send-message skill

## Benefits

- **No manual YAML writing** — Script handles all formatting
- **No timestamp errors** — Automatically generates correct ISO 8601 format
- **No typos** — Structured generation prevents field name mistakes
- **Atomic operation** — YAML write + agent wake in single call
- **Context efficient** — Replaces ~150 tokens of manual YAML creation with ~30 tokens

## Output

```
✅ Task assigned to ignis (task_1707878400)
Sent to ignis (ff15:main.2)
```

## For Noctis Only

This skill is designed exclusively for Noctis (King) to delegate tasks to Comrades. Comrades should never use this skill — they report via `/send-report` instead.

---
name: luna-to-noctis
description: Send instructions from Lunafreya to Noctis with automated YAML generation and timestamping. Use when Lunafreya (Oracle) needs to instruct Noctis for project-wide coordination. Automatically generates command_id, timestamp, writes to queue/lunafreya_to_noctis.yaml, and wakes Noctis via send-message.
metadata:
  author: multi-agent-ff15
  version: "1.0"
  created: "2026-02-14"
---

# luna-to-noctis

Send instructions from Lunafreya to Noctis with automated YAML generation and notification.

## Usage

```bash
.opencode/skills/luna-to-noctis/scripts/luna_to_noctis.sh "<description>" [priority]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `description` | Yes | Instruction details (quote if contains spaces) |
| `priority` | No | Priority level: `low`, `medium`, or `high` (default: `medium`) |

### Examples

**Basic instruction:**
```bash
.opencode/skills/luna-to-noctis/scripts/luna_to_noctis.sh "Investigate performance bottleneck in API"
```

**High priority:**
```bash
.opencode/skills/luna-to-noctis/scripts/luna_to_noctis.sh "Investigate performance bottleneck in API" "high"
```

## What It Does

1. **Validates** priority (must be low, medium, or high)
2. **Generates** unique `command_id` (format: `luna_cmd_<unix_timestamp>`)
3. **Generates** ISO 8601 timestamp automatically
4. **Writes** YAML to `queue/lunafreya_to_noctis.yaml`:
   ```yaml
   command:
     command_id: luna_cmd_1707878400
     description: "Investigate performance bottleneck"
     priority: high
     status: pending
     timestamp: "2026-02-14T15:30:00"
   ```
5. **Wakes** Noctis via send-message skill

## Benefits

- **No manual YAML writing** — Script handles all formatting
- **No timestamp errors** — Automatically generates correct ISO 8601 format
- **Atomic operation** — YAML write + Noctis wake in single call
- **Context efficient** — Replaces ~150 tokens of manual YAML creation with ~30 tokens

## Output

```
✅ Instruction sent to Noctis (luna_cmd_1707878400)
Sent to noctis (ff15:main.0)
```

## For Lunafreya Only

This skill is exclusively for Lunafreya (Oracle) to instruct Noctis. Noctis responds via `/noctis-to-luna`.

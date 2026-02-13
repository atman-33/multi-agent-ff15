---
name: noctis-to-luna
description: Send responses from Noctis to Lunafreya with automated YAML generation and timestamping. Use when Noctis needs to respond to Lunafreya's instructions. Automatically generates response_id, timestamp, writes to queue/noctis_to_lunafreya.yaml, and wakes Lunafreya via send-message.
metadata:
  author: multi-agent-ff15
  version: "1.0"
  created: "2026-02-14"
---

# noctis-to-luna

Send responses from Noctis to Lunafreya with automated YAML generation and notification.

## Usage

```bash
.opencode/skills/noctis-to-luna/scripts/noctis_to_luna.sh "<original_command_id>" "<description>"
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `original_command_id` | Yes | Command ID from Luna's instruction (e.g., `luna_cmd_1707878400`) |
| `description` | Yes | Response details (quote if contains spaces) |

### Examples

**Basic response:**
```bash
.opencode/skills/noctis-to-luna/scripts/noctis_to_luna.sh "luna_cmd_1707878400" "Investigation complete. Root cause identified."
```

**Completion report:**
```bash
.opencode/skills/noctis-to-luna/scripts/noctis_to_luna.sh "luna_cmd_1707878401" "Review completed. No issues found."
```

## What It Does

1. **Generates** unique `response_id` (format: `noct_resp_<unix_timestamp>`)
2. **Generates** ISO 8601 timestamp automatically
3. **Writes** YAML to `queue/noctis_to_lunafreya.yaml`:
   ```yaml
   response:
     response_id: "noct_resp_1707878450"
     original_command_id: "luna_cmd_1707878400"
     description: "Investigation complete"
     status: responded
     timestamp: "2026-02-14T15:35:00"
   ```
4. **Wakes** Lunafreya via send-message skill

## Benefits

- **No manual YAML writing** — Script handles all formatting
- **No timestamp errors** — Automatically generates correct ISO 8601 format
- **Atomic operation** — YAML write + Luna wake in single call
- **Context efficient** — Replaces ~150 tokens of manual YAML creation with ~30 tokens

## Output

```
✅ Response sent to Lunafreya (noct_resp_1707878450)
Sent to lunafreya (ff15:main.1)
```

## For Noctis Only

This skill is exclusively for Noctis (King) to respond to Lunafreya's instructions. Lunafreya sends instructions via `/luna-to-noctis`.

---
name: luna-to-noctis
description: Send messages from Lunafreya to Noctis with automated YAML generation and timestamping. Supports priority and reply threading. Automatically generates message_id, timestamp, writes to queue/lunafreya_to_noctis.yaml, and wakes Noctis via send-message.
metadata:
  author: multi-agent-ff15
  version: "3.0"
  created: "2026-02-14"
  updated: "2026-02-14"
---

# luna-to-noctis

Send messages from Lunafreya to Noctis with automated YAML generation and notification.

## Usage

```bash
.opencode/skills/luna-to-noctis/scripts/luna_to_noctis.sh "<description>" [priority] [in_reply_to]
```

### Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `description` | Yes | - | Message content (quote if contains spaces) |
| `priority` | No | `medium` | Priority level: `low`, `medium`, `high` |
| `in_reply_to` | No | `null` | Message ID to reply to (for threading) |

### Examples

**Simple message (default priority):**
```bash
.opencode/skills/luna-to-noctis/scripts/luna_to_noctis.sh "Investigate performance bottleneck in API"
.opencode/skills/luna-to-noctis/scripts/luna_to_noctis.sh "Review authentication module" "high"
```

**Reply to Noctis's message:**
```bash
.opencode/skills/luna-to-noctis/scripts/luna_to_noctis.sh "Investigation complete. See details below." "medium" "noct_msg_1234567890"
```

**Low priority notification:**
```bash
.opencode/skills/luna-to-noctis/scripts/luna_to_noctis.sh "User session created successfully" "low"
```

## What It Does

1. **Validates** priority (low, medium, high)
2. **Generates** unique `message_id` (format: `luna_msg_<unix_timestamp>`)
3. **Generates** ISO 8601 timestamp automatically
4. **Writes** YAML to `queue/lunafreya_to_noctis.yaml`:
   ```yaml
   message:
     message_id: luna_msg_1771005319
     in_reply_to: noct_msg_1234567890
     description: "What do you think about this approach?"
     priority: medium
     timestamp: "2026-02-14T02:55:19"
   ```
5. **Wakes** Noctis via send-message with unified letter-style message: "Lunafreya からのレターがあります"

## Benefits

- **Simplified interface** — No type selection, just send the message
- **Unified messaging** — Consistent, predictable wake message format
- **Conversation threading** — `in_reply_to` links messages
- **Priority levels** — Low, medium, high for routing importance
- **No manual YAML writing** — Script handles all formatting
- **Token efficient** — Reduced parameter processing

## Output

```
✅ Message sent to Noctis (luna_msg_1771005319)
Sent to lunafreya (ff15:main.1)
```

## For Lunafreya Only

This skill is exclusively for Lunafreya (Oracle) to communicate with Noctis. Noctis responds via `/noctis-to-luna`.

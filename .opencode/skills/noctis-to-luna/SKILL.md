---
name: noctis-to-luna
description: Send messages from Noctis to Lunafreya with automated YAML generation and timestamping. Automatically generates message_id, timestamp, writes to queue/noctis_to_lunafreya.yaml, and wakes Lunafreya via send-message.
metadata:
  author: multi-agent-ff15
  version: "3.0"
  created: "2026-02-14"
  updated: "2026-02-14"
---

# noctis-to-luna

Send messages from Noctis to Lunafreya with automated YAML generation and notification.

## Usage

```bash
.opencode/skills/noctis-to-luna/scripts/noctis_to_luna.sh "<description>" [priority] [in_reply_to]
```

### Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `description` | Yes | - | Message content (quote if contains spaces) |
| `priority` | No | `medium` | Priority level: `low`, `medium`, `high` |
| `in_reply_to` | No | `null` | Message ID to reply to (for threading) |

### Examples

**Basic message (default priority):**
```bash
.opencode/skills/noctis-to-luna/scripts/noctis_to_luna.sh "Investigation complete. Root cause identified."
```

**With priority:**
```bash
.opencode/skills/noctis-to-luna/scripts/noctis_to_luna.sh "What's your take on this technical decision?" "high"
```

**With threading:**
```bash
.opencode/skills/noctis-to-luna/scripts/noctis_to_luna.sh "Review completed. See report." "medium" "luna_msg_1234567890"
```

## What It Does

1. **Validates** priority level
2. **Generates** unique `message_id` (format: `noct_msg_<unix_timestamp>`)
3. **Generates** ISO 8601 timestamp automatically
4. **Writes** YAML to `queue/noctis_to_lunafreya.yaml`:
   ```yaml
   message:
     message_id: noct_msg_1771005326
     in_reply_to: luna_msg_1234567890
     description: "What's your take on this technical decision?"
     priority: high
     timestamp: "2026-02-14T02:55:26"
   ```
5. **Wakes** Lunafreya via send-message with unified letter: "Noctis からのお便りです"

## Benefits

- **Bidirectional communication** — Noctis can initiate conversations too
- **Conversation threading** — `in_reply_to` links messages
- **Unified messaging** — Single wake message for all communication types
- **No manual YAML writing** — Script handles all formatting
- **Token efficient** — Replaces ~150 tokens of manual YAML with ~25 tokens

## Output

```
✅ Message sent to Lunafreya (noct_msg_1771005326)
Sent to lunafreya (ff15:main.1)
```

## For Noctis Only

This skill is exclusively for Noctis (King) to communicate with Lunafreya. Lunafreya sends messages via `/luna-to-noctis`.

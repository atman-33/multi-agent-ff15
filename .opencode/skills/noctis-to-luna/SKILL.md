---
name: noctis-to-luna
description: Send messages from Noctis to Lunafreya with automated YAML generation and timestamping. Supports instruction, consultation, response, and info types. Automatically generates message_id, timestamp, writes to queue/noctis_to_lunafreya.yaml, and wakes Lunafreya via send-message.
metadata:
  author: multi-agent-ff15
  version: "2.0"
  created: "2026-02-14"
  updated: "2026-02-14"
---

# noctis-to-luna

Send messages from Noctis to Lunafreya with automated YAML generation and notification.

## Usage

```bash
.opencode/skills/noctis-to-luna/scripts/noctis_to_luna.sh "<description>" [type] [priority] [in_reply_to]
```

### Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `description` | Yes | - | Message content (quote if contains spaces) |
| `type` | No | `response` | Message type: `instruction`, `consultation`, `response`, `info` |
| `priority` | No | `medium` | Priority level: `low`, `medium`, `high` |
| `in_reply_to` | No | `null` | Message ID to reply to (for threading) |

### Examples

**Response (default - reply to Luna's message):**
```bash
.opencode/skills/noctis-to-luna/scripts/noctis_to_luna.sh "Investigation complete. Root cause identified."
.opencode/skills/noctis-to-luna/scripts/noctis_to_luna.sh "Review completed. See report." "response" "medium" "luna_msg_1234567890"
```

**Consultation:**
```bash
.opencode/skills/noctis-to-luna/scripts/noctis_to_luna.sh "What's your take on this technical decision?" "consultation" "high"
```

**Instruction (request Luna to do something):**
```bash
.opencode/skills/noctis-to-luna/scripts/noctis_to_luna.sh "Please review this approach" "instruction" "medium"
```

**Info (notification):**
```bash
.opencode/skills/noctis-to-luna/scripts/noctis_to_luna.sh "All Comrades completed their tasks" "info" "low"
```

## What It Does

1. **Validates** type and priority
2. **Generates** unique `message_id` (format: `noct_msg_<unix_timestamp>`)
3. **Generates** ISO 8601 timestamp automatically
4. **Writes** YAML to `queue/noctis_to_lunafreya.yaml`:
   ```yaml
   message:
     message_id: noct_msg_1771005326
     type: consultation
     in_reply_to: luna_msg_1234567890
     description: "What's your take on this technical decision?"
     priority: high
     timestamp: "2026-02-14T02:55:26"
   ```
5. **Wakes** Lunafreya via send-message with contextual message:
   - `instruction` → "Noctis からの指示があります"
   - `consultation` → "Noctis からの相談があります"
   - `response` → "Noctis からの返信があります"
   - `info` → "Noctis からの連絡があります"

## Message Types

| Type | Use Case | Example |
|------|----------|---------|
| `instruction` | Request Luna to review or analyze | "Please review this architecture decision" |
| `consultation` | Ask for Luna's opinion | "Which approach do you recommend?" |
| `response` | Reply to Luna's message | "Completed as requested" |
| `info` | Informational update | "All tasks completed successfully" |

## Benefits

- **Bidirectional communication** — Noctis can initiate conversations too
- **Conversation threading** — `in_reply_to` links messages
- **Contextual wake messages** — Luna knows what type of message to expect
- **No manual YAML writing** — Script handles all formatting
- **Token efficient** — Replaces ~150 tokens of manual YAML with ~30 tokens

## Output

```
✅ Message sent to Lunafreya (noct_msg_1771005326, type: consultation)
Sent to lunafreya (ff15:main.1)
```

## For Noctis Only

This skill is exclusively for Noctis (King) to communicate with Lunafreya. Lunafreya sends messages via `/luna-to-noctis`.

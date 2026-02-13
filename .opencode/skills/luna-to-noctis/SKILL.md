---
name: luna-to-noctis
description: Send messages from Lunafreya to Noctis with automated YAML generation and timestamping. Supports instruction, consultation, response, and info types. Automatically generates message_id, timestamp, writes to queue/lunafreya_to_noctis.yaml, and wakes Noctis via send-message.
metadata:
  author: multi-agent-ff15
  version: "2.0"
  created: "2026-02-14"
  updated: "2026-02-14"
---

# luna-to-noctis

Send messages from Lunafreya to Noctis with automated YAML generation and notification.

## Usage

```bash
.opencode/skills/luna-to-noctis/scripts/luna_to_noctis.sh "<description>" [type] [priority] [in_reply_to]
```

### Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `description` | Yes | - | Message content (quote if contains spaces) |
| `type` | No | `instruction` | Message type: `instruction`, `consultation`, `response`, `info` |
| `priority` | No | `medium` | Priority level: `low`, `medium`, `high` |
| `in_reply_to` | No | `null` | Message ID to reply to (for threading) |

### Examples

**Instruction (default):**
```bash
.opencode/skills/luna-to-noctis/scripts/luna_to_noctis.sh "Investigate performance bottleneck in API"
.opencode/skills/luna-to-noctis/scripts/luna_to_noctis.sh "Review authentication module" "instruction" "high"
```

**Consultation:**
```bash
.opencode/skills/luna-to-noctis/scripts/luna_to_noctis.sh "What do you think about this approach?" "consultation" "medium"
```

**Response (reply to Noctis's message):**
```bash
.opencode/skills/luna-to-noctis/scripts/luna_to_noctis.sh "Investigation complete. See details below." "response" "medium" "noct_msg_1234567890"
```

**Info (notification):**
```bash
.opencode/skills/luna-to-noctis/scripts/luna_to_noctis.sh "User session created successfully" "info" "low"
```

## What It Does

1. **Validates** type and priority
2. **Generates** unique `message_id` (format: `luna_msg_<unix_timestamp>`)
3. **Generates** ISO 8601 timestamp automatically
4. **Writes** YAML to `queue/lunafreya_to_noctis.yaml`:
   ```yaml
   message:
     message_id: luna_msg_1771005319
     type: consultation
     in_reply_to: noct_msg_1234567890
     description: "What do you think about this approach?"
     priority: medium
     timestamp: "2026-02-14T02:55:19"
   ```
5. **Wakes** Noctis via send-message with contextual message:
   - `instruction` → "Lunafreya からの指示があります"
   - `consultation` → "Lunafreya からの相談があります"
   - `response` → "Lunafreya からの返信があります"
   - `info` → "Lunafreya からの連絡があります"

## Message Types

| Type | Use Case | Example |
|------|----------|---------|
| `instruction` | Direct task assignment to Noctis | "Coordinate with Comrades to implement feature X" |
| `consultation` | Ask for opinion or advice | "Should we use approach A or B?" |
| `response` | Reply to Noctis's message | "Reviewed. Approach looks good." |
| `info` | Informational notification | "User request completed" |

## Benefits

- **Bidirectional communication** — No longer assumes Luna always initiates
- **Conversation threading** — `in_reply_to` links messages
- **Contextual wake messages** — Noctis knows what type of message to expect
- **No manual YAML writing** — Script handles all formatting
- **Token efficient** — Replaces ~150 tokens of manual YAML with ~30 tokens

## Output

```
✅ Message sent to Noctis (luna_msg_1771005319, type: consultation)
Sent to noctis (ff15:main.0)
```

## For Lunafreya Only

This skill is exclusively for Lunafreya (Oracle) to communicate with Noctis. Noctis responds via `/noctis-to-luna`.

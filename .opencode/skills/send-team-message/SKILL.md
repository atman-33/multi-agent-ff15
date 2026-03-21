---
name: send-team-message
description: Send a mission-based direct message inside the Noctis team when work needs to be routed from Noctis to a teammate or from a teammate back to Noctis. Use when you need to send a structured message with missionId fromAgent toAgent type and body, and you must use the repository script instead of raw prompt calls.
---

# Send Team Message

Use this skill to deliver a structured Noctis-team message through the repository messaging flow.

Use one skill, but choose one of three intents:

- **`dispatch`** — Noctis initiates a tracked request-response flow. Worker must return answer via `report/update` with matching `taskId`
- **`notify`** — Best-effort one-way notification/share. Delivery is guaranteed, **response is not guaranteed and must not be relied upon**
- **`report`** — Worker returns answer to Noctis, tied to a `taskId` from a prior `dispatch`

Do not use `query`. It has been removed because the name suggested a reply would come back.

## Required Inputs

- `intent` — `dispatch` | `notify` | `report`
- `missionId`
- agent IDs required by the chosen intent
- `body`
- `taskId` when the intent is `dispatch` or `report`

## MVP Guardrails

- Allow only `Noctis -> worker` or `worker -> Noctis`
- Never send `worker -> worker`
- Never call raw `/api/session/:id/prompt` for this workflow
- Never route by `sessionId` manually when `missionId` is available
- Use `report` only when a concrete `taskId` exists from a prior `dispatch`
- **Treat `notify` as best-effort notification only; never expect a guaranteed reply**
- **When Noctis needs a tracked answer, use `dispatch` + `report`, not `notify`**
- **If the message asks a question and expects any answer (even yes/no, acknowledgement, or “I’m fine”), use `dispatch`, not `notify`**

## Workflow

1. Classify the request as `dispatch`, `notify`, or `report`.
2. Confirm the required arguments for that intent.
3. Reject `worker -> worker`.
4. Run the matching bundled script.
5. Return the resulting JSON or error.

## Intent Mapping

| Intent | Direction | Internal type | Purpose | Reply Expectation |
|---|---|---|---|---|
| `dispatch` | `noctis -> worker` | task dispatch | Noctis requests tracked answer | Worker must respond via `report/update` with `taskId` |
| `notify` | `noctis -> worker` or `worker -> noctis` | `notify` | Best-effort notification/share | **No guarantee** — do not rely on reply |
| `report` | `worker -> noctis` | `report` or `update` | Worker returns answer to tracked dispatch | No reply expected |

## Command

### Dispatch

```bash
node .opencode/skills/send-team-message/scripts/dispatch.mjs <missionId> <fromAgent> <toAgent> <instruction|handoff> <taskId> <body>
```

### Notify

Uses `notify.mjs` and the `notify` message type.

```bash
node .opencode/skills/send-team-message/scripts/notify.mjs <missionId> <fromAgent> <toAgent> <body>
```

If the body looks like a question or asks for acknowledgement/confirmation, the script rejects it and tells you to use `dispatch`.

### Report

```bash
node .opencode/skills/send-team-message/scripts/report.mjs <missionId> <fromAgent> <taskId> <report|update> <body>
```

### Unified entry

```bash
node .opencode/skills/send-team-message/scripts/send-team-message.mjs <dispatch|notify|report>
```

All scripts resolve mission-bound sessions and record delivery in the mission log.

## Example

```bash
# Dispatch: Noctis asks Ignis for analysis. Ignis must respond with report + taskId.
node .opencode/skills/send-team-message/scripts/dispatch.mjs mis_123 noctis ignis instruction task_001 "Analyze the current routing logic and summarize the failure points."

# Report: Ignis returns answer to Noctis with the taskId from dispatch.
node .opencode/skills/send-team-message/scripts/report.mjs mis_123 ignis task_001 report "Analysis complete: failure is in the queue resolver logic."

# Notify: Noctis shares info with Ignis (no guaranteed reply expected).
node .opencode/skills/send-team-message/scripts/notify.mjs mis_123 noctis ignis "New requirement: prioritize read-only mode support."

# If Noctis asks a question and needs an answer, use dispatch instead.
node .opencode/skills/send-team-message/scripts/dispatch.mjs mis_123 noctis ignis instruction task_002 "Reply whether you are available and ready to proceed. Return via report with the same taskId."
```

Or using the unified entry:

```bash
node .opencode/skills/send-team-message/scripts/send-team-message.mjs notify mis_123 noctis ignis "New requirement: prioritize read-only mode support."
```

## Key Principles

- **Tracked request-response**: `dispatch` → `report` with matching `taskId`
- **One-way notification**: `notify` is fire-and-forget; do not wait for a reply
- **Worker answers return via report**: Never expect a response to `notify`; always use `dispatch` if you need one
- **Chat output is not delivery**: A worker must use the `send-team-message` report/update path for tracked replies; printing JSON in chat does not complete the task
- **Mission identity**: Service/script layer enforces `missionId`, never rely on `sessionId` directly

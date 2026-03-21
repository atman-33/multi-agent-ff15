---
name: send-team-message
description: Send a mission-based direct message inside the Noctis team when work needs to be routed from Noctis to a teammate or from a teammate back to Noctis. Use when you need to send a structured message with missionId fromAgent toAgent type and body, and you must use the repository script instead of raw prompt calls.
---

# Send Team Message

Use this skill to deliver a structured Noctis-team message through the repository messaging flow.

Use one skill, but choose one of three intents:

- `dispatch` — structured worker dispatch from Noctis to a worker
- `query` — question with `replyRequested=true`; delivery is guaranteed, response is not guaranteed
- `report` — worker-to-Noctis report or update tied to a `taskId`

## Required Inputs

- `intent` — `dispatch` | `query` | `report`
- `missionId`
- agent IDs required by the chosen intent
- `body`
- `taskId` when the intent is `dispatch` or `report`

## MVP Guardrails

- Allow only `Noctis -> worker` or `worker -> Noctis`
- Never send `worker -> worker`
- Never call raw `/api/session/:id/prompt` for this workflow
- Never route by `sessionId` manually when `missionId` is available
- Use `report` only when a concrete `taskId` exists
- Treat `query` as best-effort reply, not a guaranteed callback

## Workflow

1. Classify the request as `dispatch`, `query`, or `report`.
2. Confirm the required arguments for that intent.
3. Reject `worker -> worker`.
4. Run the matching bundled script.
5. Return the resulting JSON or error.

## Intent Mapping

| Intent | Direction | Internal type | Reply |
|---|---|---|---|
| `dispatch` | `noctis -> worker` | task dispatch | no |
| `query` | `noctis -> worker` or `worker -> noctis` | `question` | best effort |
| `report` | `worker -> noctis` | `report` or `update` | no |

## Command

### Dispatch

```bash
node .opencode/skills/send-team-message/scripts/dispatch.mjs <missionId> <fromAgent> <toAgent> <instruction|handoff> <taskId> <body>
```

### Query

```bash
node .opencode/skills/send-team-message/scripts/query.mjs <missionId> <fromAgent> <toAgent> <body>
```

### Report

```bash
node .opencode/skills/send-team-message/scripts/report.mjs <missionId> <fromAgent> <taskId> <report|update> <body>
```

### Unified entry

```bash
node .opencode/skills/send-team-message/scripts/send-team-message.mjs <dispatch|query|report> ...
```

All scripts resolve mission-bound sessions and record delivery in the mission log.

## Example

```bash
node .opencode/skills/send-team-message/scripts/dispatch.mjs mis_123 noctis ignis instruction task_001 "Analyze the current routing logic and summarize the failure points."
```

---
name: send-team-message
description: Send a mission-based direct message inside the Noctis team when work needs to be routed from Noctis to a teammate or from a teammate back to Noctis. Use when you need to send a structured message with missionId fromAgent toAgent type and body, and you must use the repository script instead of raw prompt calls.
---

# Send Team Message

Use this skill to deliver a structured Noctis-team message through the repository messaging flow.

## Required Inputs

- `missionId`
- `fromAgent` — `noctis` | `ignis` | `gladiolus` | `prompto`
- `toAgent` — `noctis` | `ignis` | `gladiolus` | `prompto`
- `type` — `instruction` | `question` | `update` | `report` | `handoff`
- `body`

## MVP Guardrails

- Allow only `Noctis -> worker` or `worker -> Noctis`
- Never send `worker -> worker`
- Never call raw `/api/session/:id/prompt` for this workflow
- Never route by `sessionId` manually when `missionId` is available

## Workflow

1. Confirm the five required inputs are known.
2. Reject the request if it is `worker -> worker`.
3. Run the bundled wrapper script.
4. Return the resulting JSON or error.

## Command

Run:

```bash
node .opencode/skills/send-team-message/scripts/send-team-message.mjs <missionId> <fromAgent> <toAgent> <type> <body>
```

This script resolves mission-bound sessions and records delivery in the mission log.

## Example

```bash
node .opencode/skills/send-team-message/scripts/send-team-message.mjs mis_123 noctis ignis instruction "Analyze the current routing logic and summarize the failure points."
```

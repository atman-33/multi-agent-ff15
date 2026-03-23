---
name: session-rename
description: Rename the current OpenCode session or a specified session using a bundled script when the user asks to change or normalize a session title.
---

# Session Rename

Rename an OpenCode session title using the bundled script.

Use this skill when the user asks to:

- rename the current session
- set a better session title
- normalize or refresh a session name
- rename a specific session by id

## Default Behavior

- Prefer the injected `session_id` from the current prompt context and pass it with `--session-id`.
- Fall back to `SESSION_ID` only when injected context is not available.
- If the target session is not the current one, pass `--session-id <id>` explicitly.
- Keep titles short and descriptive.
- Do not rename a session unless the user asked for it or the active workflow explicitly requires it.

## Command

```bash
node .opencode/skills/session-rename/scripts/rename-session.mjs "<new title>"
```

Explicit session id:

```bash
node .opencode/skills/session-rename/scripts/rename-session.mjs --session-id <session_id> "<new title>"
```

Optional base URL override:

```bash
OPENCODE_BASE_URL=http://127.0.0.1:4097 \
node .opencode/skills/session-rename/scripts/rename-session.mjs "<new title>"
```

## Rules

1. Prefer action-oriented titles tied to the task.
2. Preserve user intent; do not paraphrase away important nouns.
3. Fail fast if neither `SESSION_ID` nor `--session-id` is available.
4. Read the script source only if you need to modify its behavior.
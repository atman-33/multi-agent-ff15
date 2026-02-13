# YAML Write Validator Plugin

Prevents agents from writing to wrong YAML files by validating file direction at tool call time.

## Problem

Agents sometimes confuse the `sender_to_receiver.yaml` naming pattern:
- Noctis mistakenly writes to `lunafreya_to_noctis.yaml` (incoming file) instead of `noctis_to_lunafreya.yaml` (outgoing file)
- Similar confusion possible for Lunafreya
- Comrades should never write to coordination channel files

## Solution

This plugin intercepts `write` and `edit` tool calls via `beforeToolCall` hook and validates:

1. **Noctis validation**: Blocks writes to `queue/lunafreya_to_noctis.yaml` (incoming)
2. **Lunafreya validation**: Blocks writes to `queue/noctis_to_lunafreya.yaml` (incoming)
3. **Comrades validation**: Blocks writes to both coordination files (unauthorized)

## How It Works

### Detection

The plugin checks `process.env.AGENT_ID` to identify the current agent and validates file paths before write/edit operations execute.

### Error Messages

When validation fails, the agent receives a clear multi-line error:

```
❌ FILE DIRECTION ERROR (Noctis)

You are trying to WRITE to your INCOMING file.

File naming: sender_to_receiver.yaml
  • lunafreya_TO_noctis = Luna sends TO you (INCOMING = you READ)
  • noctis_TO_lunafreya = You send TO Luna (OUTGOING = you WRITE)

Correct action:
  READ from:  queue/lunafreya_to_noctis.yaml (Luna → You)
  WRITE to:   queue/noctis_to_lunafreya.yaml (You → Luna)
```

### Logging

All validation errors are logged to OpenCode's structured logging system:

```typescript
await client.app.log({
  body: {
    service: "yaml-write-validator",
    level: "error",
    message: "Blocked invalid write attempt: queue/lunafreya_to_noctis.yaml by noctis",
  },
})
```

## Installation

1. Plugin is already installed in `.opencode/plugins/yaml-write-validator.ts`
2. OpenCode automatically loads it on next startup
3. **CRITICAL**: Set `AGENT_ID` environment variable before starting OpenCode:

```bash
# In standby.sh (already implemented):
export AGENT_ID="noctis"
opencode
```

## Testing

To verify the plugin works:

1. Start OpenCode with `AGENT_ID` set
2. Attempt to write to wrong file:
   ```
   # As Noctis, try:
   write("queue/lunafreya_to_noctis.yaml", "test content")
   ```
3. Plugin should block with error message
4. Check OpenCode logs to confirm validation error was logged

## Requirements

- `AGENT_ID` environment variable must be set to: `noctis`, `lunafreya`, `ignis`, `gladiolus`, or `prompto`
- If `AGENT_ID` is not set, plugin silently allows all writes (fail-open for safety)

## Path Normalization

Plugin normalizes paths to handle both absolute and relative formats:

```typescript
const normalizedPath = filePath.replace(/^\.?\//, "")
// "./queue/file.yaml" → "queue/file.yaml"
// "/path/to/queue/file.yaml" → "path/to/queue/file.yaml"
// "queue/file.yaml" → "queue/file.yaml"
```

## Validation Rules

### Noctis

- ✅ Can write: `queue/noctis_to_lunafreya.yaml` (outgoing)
- ✅ Can read: `queue/lunafreya_to_noctis.yaml` (incoming)
- ❌ Cannot write: `queue/lunafreya_to_noctis.yaml`

### Lunafreya

- ✅ Can write: `queue/lunafreya_to_noctis.yaml` (outgoing)
- ✅ Can read: `queue/noctis_to_lunafreya.yaml` (incoming)
- ❌ Cannot write: `queue/noctis_to_lunafreya.yaml`

### Comrades (Ignis, Gladiolus, Prompto)

- ✅ Can write: `queue/reports/{name}_report.yaml`
- ✅ Can read: `queue/tasks/{name}.yaml`
- ❌ Cannot write: `queue/lunafreya_to_noctis.yaml`
- ❌ Cannot write: `queue/noctis_to_lunafreya.yaml`

## Disable Plugin

To disable temporarily:
1. Rename file: `yaml-write-validator.ts.disabled`
2. Restart OpenCode

To re-enable:
1. Rename back to `.ts`
2. Restart OpenCode

## Notes

- Plugin only validates `write` and `edit` tools (other tools pass through)
- Validation is fail-open: if `AGENT_ID` is missing, no validation occurs
- Error messages are designed to teach correct file usage
- Complements enhanced instructions in `.opencode/agents/noctis.md` and `.opencode/agents/lunafreya.md`

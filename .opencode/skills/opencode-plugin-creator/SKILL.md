---
name: opencode-plugin-creator
description: Creates custom OpenCode plugins with hook functionality. Use when you need to extend OpenCode behavior by intercepting events (file edits, tool execution, session lifecycle, etc.). Generates TypeScript/JavaScript plugins in .opencode/plugins/ directory with proper structure and type safety.
---

# OpenCode Plugin Creator

## Plugin Loading

Local files (auto-loaded at startup):
- Project-level: `.opencode/plugins/` (JS or TS)
- Global: `~/.config/opencode/plugins/`

npm packages: specified in `opencode.json`.

## Plugin Structure

```typescript
// .opencode/plugins/my-plugin.ts
import type { Plugin } from "@opencode-ai/plugin"

declare const process: { env: Record<string, string | undefined> }

export const MyPlugin: Plugin = async ({ $ }) => {
  const log = async (message: string): Promise<void> => {
    try {
      const timestamp = new Date().toISOString()
      await $`echo ${`[${timestamp}] my-plugin: ${message}`} >> logs/my-plugin.log`.quiet()
    } catch {}
  }

  const checkPython = async (): Promise<void> => {
    try {
      await $`python3 --version`.quiet()
    } catch (e) {
      const timestamp = new Date().toISOString()
      await $`echo ${`[${timestamp}] my-plugin: [ERROR] python3 not available: ${String(e)}`} >> logs/my-plugin.log`.quiet()
    }
  }

  // Python health check (required if plugin uses python3)
  await checkPython()

  // Required log: plugin start
  await log("MyPlugin started")

  return {
    event: async ({ event }) => {
      if (event.type === "some.event") {
        // Required log: trigger
        await log("[TRIGGER] some.event fired")

        try {
          // ... logic
        } catch (e) {
          // Required log: error
          await log(`[ERROR] ${e}`)
        }
      }
    },
  }
}
```

## Logging Convention

**No `ENABLE_LOGGING` flag.** Logging is always enabled.

Mandatory log points in every plugin:

| When | Log format |
|------|-----------|
| Plugin initializes | `"PluginName started"` |
| Event/trigger fires | `"[TRIGGER] event.type ..."` |
| Error occurs | `"[ERROR] ..."` |

```typescript
// Define inline in each plugin (captures $ from outer scope)
const log = async (message: string): Promise<void> => {
  try {
    const timestamp = new Date().toISOString()
    await $`echo ${`[${timestamp}] plugin-name: ${message}`} >> logs/plugin-name.log`.quiet()
  } catch {}
}
```

## Python Dependency

Some operations require `python3` (YAML parsing, atomic file writes). Shell alone is insufficient for these.

**Policy**: Use shell for all operations first. Use `python3` only when shell is insufficient.

| Use case | Tool |
|----------|------|
| YAML parse (`yaml.safe_load`) | python3 |
| Atomic file write (`os.rename`) | python3 |
| Simple text operations | shell |

**Required: health check at plugin startup** for any plugin using python3:

```typescript
const checkPython = async (): Promise<void> => {
  try {
    await $`python3 --version`.quiet()
  } catch (e) {
    const timestamp = new Date().toISOString()
    await $`echo ${`[${timestamp}] plugin-name: [ERROR] python3 not available: ${String(e)}`} >> logs/plugin-name.log`.quiet()
  }
}
```

Call `await checkPython()` at the top of any plugin that uses `python3`.

### Python Scripts in `.opencode/lib/`

**Do not embed Python logic inline (`python3 -c "..."`) in plugins.**
Instead, place all Python scripts in `.opencode/lib/` and call them as external scripts.
This makes each script independently testable: `python3 .opencode/lib/your_script.py <args>`.

#### Provided lib scripts

| Script | Purpose | Modes / Args |
|--------|---------|-------------|
| `inbox_reader.py` | Read inbox YAML | `<inbox_path> latest-unread-id` / `report-fields` / `task-fields` / `luna-fields` / `filter-json --types T1 T2` |
| `yaml_atomic_write.py` | Atomic file write via `os.rename` | `<content> <tmp_path> <target_path>` |
| `project_loader.py` | Load project config / definition | `active-ids` / `project-def <id>` |
| `report_checker.py` | Check if agent submitted report | `<agent_id>` → prints `MISSING:<task_id>` or empty |

#### Usage examples

```typescript
// Inbox: get latest unread message ID
const result = await $`python3 .opencode/lib/inbox_reader.py ${inboxPath} latest-unread-id`.quiet()

// Inbox: filter messages by type (returns JSON array)
const result = await $`python3 .opencode/lib/inbox_reader.py ${inboxPath} filter-json --types message error`.quiet()
const messages = JSON.parse(result.text())

// Atomic write
await $`python3 .opencode/lib/yaml_atomic_write.py ${content} ${tmpFile} ${targetFile}`.quiet()

// Project loader
const ids = JSON.parse((await $`python3 .opencode/lib/project_loader.py active-ids`.quiet()).text())
```

#### Adding a new lib script

When existing lib scripts don't cover your use case, create a new `.opencode/lib/<name>.py`:
1. Add a module docstring with `Usage:` and `Output:` documentation
2. Accept all inputs via `sys.argv` (no stdin)
3. Print result to stdout; errors to stderr
4. Verify it runs standalone before integrating into the plugin

## Available Events

### Tool Events
- `tool.execute.before`: Before tool execution (throw to prevent)
- `tool.execute.after`: After tool execution

### Session Events
- `session.created`, `session.idle`, `session.compacted`, `session.deleted`
- `session.error`, `session.status`, `session.updated`

### File Events
- `file.edited`
- `file.watcher.updated` (Experimental: requires `OPENCODE_EXPERIMENTAL_FILEWATCHER=true`)

### Shell / Other Events
- `shell.env`: Inject env vars before shell execution
- `message.updated`, `message.removed`, `permission.asked`, `todo.updated`
- `lsp.client.diagnostics`, `experimental.session.compacting`

## Common Patterns

### Protect File from Reading

```typescript
"tool.execute.before": async (input, output) => {
  if (input.tool === "read" && output.args.filePath.includes(".env")) {
    throw new Error("Do not read .env files")
  }
}
```

### File Watcher Trigger

```typescript
event: async ({ event }) => {
  if (event.type !== "file.watcher.updated") return
  const props = event.properties as { file: string; event: "add" | "change" | "unlink" }
  await log($, "my-plugin", `[TRIGGER] file.watcher.updated: ${props.file}`)
}
```

### Inject Context on Compaction

```typescript
"experimental.session.compacting": async (input, output) => {
  output.context.push("## Persistent State\n- current task\n- decisions")
}
```

### Custom Tool

```typescript
import { type Plugin, tool } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      mytool: tool({
        description: "My custom tool",
        args: { foo: tool.schema.string() },
        async execute(args, { directory }) {
          return `Hello ${args.foo} from ${directory}`
        },
      }),
    },
  }
}
```

## External Dependencies

Create `.opencode/package.json` and OpenCode auto-runs `bun install` at startup:

```json
{ "dependencies": { "shescape": "^2.1.0" } }
```

## Creation Checklist

- [ ] File in `.opencode/plugins/` with kebab-case name (`.ts` preferred)
- [ ] No `ENABLE_LOGGING` flag — logging always on
- [ ] Log at: plugin start, each trigger, each error
- [ ] `checkPython()` called at startup if plugin uses python3
- [ ] Python logic placed in `.opencode/lib/*.py`, not inlined as `python3 -c`
- [ ] Throw in `tool.execute.before` to block execution
- [ ] Only modify `output`, never `input`

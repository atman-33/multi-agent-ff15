---
name: opencode-plugin-creator
description: Creates custom OpenCode plugins with hook functionality. Use when you need to extend OpenCode behavior by intercepting events (file edits, tool execution, session lifecycle, etc.). Generates TypeScript/JavaScript plugins in .opencode/plugins/ directory with proper structure and type safety.
---

# OpenCode Plugin Creator

## Overview

This skill helps you create custom OpenCode plugins that act as "hooks" to extend or modify OpenCode's behavior. Plugins can intercept events like file operations, tool executions, session lifecycle, and more.

## When to Use

Use this skill when you need to:
- Intercept and modify tool execution (e.g., prevent reading .env files)
- React to session events (e.g., send notifications on completion)
- Inject environment variables into shell commands
- Add custom logging or monitoring
- Create custom tools for OpenCode
- Modify compaction behavior
- Hook into file watcher events
- Protect sensitive files or operations

**Trigger phrases**: "create plugin", "add hook", "intercept tool", "protect file from opencode", "custom opencode extension"

## Plugin Loading Mechanisms

OpenCode loads plugins from two locations:

### 1. Local Files (Recommended for project-specific plugins)
- **Project-level**: `.opencode/plugins/` (JavaScript or TypeScript files)
- **Global**: `~/.config/opencode/plugins/`
- Files are automatically loaded at startup

### 2. npm Packages
- Specified in `opencode.json` config file
- Example: `{ "plugin": ["opencode-helicone-session"] }`
- Auto-installed using Bun at startup
- Cached in `~/.cache/opencode/node_modules/`

**Load order**:
1. Global config (`~/.config/opencode/opencode.json`)
2. Project config (`opencode.json`)
3. Global plugin directory
4. Project plugin directory

## Plugin Structure

### Basic Template (JavaScript)

```javascript
// .opencode/plugins/my-plugin.js
export const MyPlugin = async ({ project, client, $, directory, worktree }) => {
  console.log("Plugin initialized!")
  
  return {
    // Hook implementations go here
  }
}
```

### TypeScript Template (Recommended)

```typescript
// .opencode/plugins/my-plugin.ts
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  return {
    // Type-safe hook implementations
  }
}
```

### Context Parameters

The plugin function receives:
- `project`: Current project information
- `directory`: Current working directory
- `worktree`: Git worktree path
- `client`: OpenCode SDK client for AI interaction
- `$`: Bun's shell API for executing commands

## Available Events (Hooks)

### Command Events
- `command.executed`: After a command is executed

### File Events
- `file.edited`: After a file is edited
- `file.watcher.updated`: When file watcher detects changes (⚠️ **Experimental**, requires `OPENCODE_EXPERIMENTAL_FILEWATCHER=true`)

### Installation Events
- `installation.updated`: When dependencies are updated

### LSP Events
- `lsp.client.diagnostics`: When LSP diagnostics are received
- `lsp.updated`: When LSP is updated

### Message Events
- `message.part.removed`: When message part is removed
- `message.part.updated`: When message part is updated
- `message.removed`: When message is removed
- `message.updated`: When message is updated

### Permission Events
- `permission.asked`: When permission is requested
- `permission.replied`: When permission is replied to

### Server Events
- `server.connected`: When server connects

### Session Events
- `session.created`: When session is created
- `session.compacted`: When session is compacted
- `session.deleted`: When session is deleted
- `session.diff`: When session diff occurs
- `session.error`: When session error occurs
- `session.idle`: When session becomes idle
- `session.status`: When session status changes
- `session.updated`: When session is updated

### Todo Events
- `todo.updated`: When todo is updated

### Shell Events
- `shell.env`: Before shell command execution (inject env vars)

### Tool Events (Most Common)
- `tool.execute.before`: Before tool execution (intercept/modify)
- `tool.execute.after`: After tool execution (post-process)

### TUI Events
- `tui.prompt.append`: When prompt is appended in TUI
- `tui.command.execute`: When command is executed in TUI
- `tui.toast.show`: When toast notification is shown

### Experimental Events
- `experimental.session.compacting`: Before session compaction (inject context)

## Common Use Cases & Examples

### 1. File Protection (.env files)

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const EnvProtection: Plugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "read" && output.args.filePath.includes(".env")) {
        throw new Error("Do not read .env files")
      }
    },
  }
}
```

### 2. Notification on Session Completion

```javascript
export const NotificationPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await $`osascript -e 'display notification "Session completed!" with title "opencode"'`
      }
    },
  }
}
```

### 3. Inject Environment Variables

```javascript
export const InjectEnvPlugin = async () => {
  return {
    "shell.env": async (input, output) => {
      output.env.MY_API_KEY = "secret"
      output.env.PROJECT_ROOT = input.cwd
    },
  }
}
```

### 4. Custom Tool

```typescript
import { type Plugin, tool } from "@opencode-ai/plugin"

export const CustomToolsPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      mytool: tool({
        description: "This is a custom tool",
        args: {
          foo: tool.schema.string(),
        },
        async execute(args, context) {
          const { directory, worktree } = context
          return `Hello ${args.foo} from ${directory}`
        },
      }),
    },
  }
}
```

### 5. Structured Logging

```typescript
export const LoggingPlugin = async ({ client }) => {
  await client.app.log({
    body: {
      service: "my-plugin",
      level: "info",
      message: "Plugin initialized",
      extra: { foo: "bar" },
    },
  })
}
```

### 6. Custom Compaction Hook

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const CompactionPlugin: Plugin = async (ctx) => {
  return {
    "experimental.session.compacting": async (input, output) => {
      // Inject additional context
      output.context.push(`## Custom Context
Include state that should persist:
- Current task status
- Important decisions made
- Files being actively worked on`)
    },
  }
}
```

## Using External Dependencies

If your plugin needs external npm packages, create a `package.json` in your config directory:

**.opencode/package.json**
```json
{
  "dependencies": {
    "shescape": "^2.1.0",
    "axios": "^1.6.0"
  }
}
```

OpenCode runs `bun install` at startup. Import packages normally:

```typescript
import { escape } from "shescape"
import axios from "axios"

export const MyPlugin = async (ctx) => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "bash") {
        output.args.command = escape(output.args.command)
      }
    },
  }
}
```

## Plugin Creation Procedure

1. **Identify the Use Case**
   - What event do you want to intercept?
   - What behavior do you want to modify?
   - Which hook(s) do you need?

2. **Choose Plugin Location**
   - Project-specific: `.opencode/plugins/`
   - Global: `~/.config/opencode/plugins/`
   - npm package: For sharing/reuse

3. **Create Plugin File**
   - Use TypeScript for type safety (`.ts`)
   - Or JavaScript for simplicity (`.js`)
   - Export a named function (e.g., `export const MyPlugin = ...`)

4. **Implement Hook(s)**
   - Choose event(s) from the list above
   - Implement async handler function
   - Access `input` (event data) and `output` (modifiable)

5. **Test Plugin**
   - Restart OpenCode to load plugin
   - Verify hook is triggered
   - Check logs with `client.app.log()`

6. **Handle Dependencies (if needed)**
   - Create `.opencode/package.json`
   - Add required packages
   - OpenCode auto-installs on next startup

## Guidelines

### Best Practices
- **Use TypeScript** for type safety and better IDE support
- **Use structured logging** (`client.app.log()`) instead of `console.log`
- **Throw errors** in `before` hooks to prevent tool execution
- **Keep plugins focused** on a single responsibility
- **Document hook behavior** in comments
- **Test with different events** to ensure correct trigger

### Common Pitfalls
- ❌ Don't mutate `input` — only modify `output`
- ❌ Don't block event loop with sync operations
- ❌ Don't rely on global state (plugins may reload)
- ❌ Don't forget to handle edge cases (null, undefined)

### Debugging
- Use `client.app.log()` for structured logging
- Check OpenCode logs for plugin load errors
- Verify plugin file is in correct directory
- Ensure export name matches function name

## File Naming Conventions

- Use kebab-case: `my-plugin.ts` (not `MyPlugin.ts`)
- Use descriptive names: `env-protection.ts` (not `ep.ts`)
- Avoid conflicts with existing plugins

## Integration with multi-agent-ff15

When creating plugins for multi-agent-ff15:
- Save to `.opencode/plugins/` (project-level)
- Consider Comrade-specific behaviors (Noctis, Ignis, etc.)
- Use plugins to enforce workflow rules
- Protect sensitive files (queue/, config/)
- Add logging for debugging multi-agent interactions

## Example: Todo Continuation Hook

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const TodoContinuationHook: Plugin = async ({ client }) => {
  return {
    "todo.updated": async (input, output) => {
      const todos = input.todos
      const hasInProgress = todos.some(t => t.status === "in_progress")
      const hasCompleted = todos.some(t => t.status === "completed")
      
      if (hasCompleted && !hasInProgress) {
        await client.app.log({
          body: {
            service: "todo-continuation",
            level: "info",
            message: "All todos completed, suggesting continuation",
          },
        })
      }
    },
  }
}
```

## Resources

- [Official Plugin Docs](https://opencode.ai/docs/plugins/)
- [OpenCode SDK](https://opencode.ai/docs/sdk/)
- [Community Plugins](https://opencode.ai/docs/ecosystem#plugins)
- [Bun Shell API](https://bun.com/docs/runtime/shell)

## Summary

This skill provides the knowledge to create OpenCode plugins that act as hooks. Use it whenever you need to extend OpenCode's behavior by intercepting events, modifying tool execution, or adding custom functionality.

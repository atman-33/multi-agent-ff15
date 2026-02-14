# Iris Dashboard Analyzer Plugin

Intelligently analyzes dashboard state and reports by invoking Iris subagent to provide actionable guidance for Noctis.

## Features

- **Iris-Powered Analysis**: Invokes Iris subagent to analyze dashboard and reports
- **Todo Completion Tracking**: Detects completed todos not yet reflected in dashboard
- **Comrade Report Monitoring**: Detects new reports from agents
- **Smart Cooldown**: 30-second cooldown between reminders
- **Contextual Summaries**: Iris generates concise, actionable recommendations
- **Structured Logging**: All operations logged via OpenCode logging system

## Installation

Plugin is already installed in `.opencode/plugins/iris-dashboard-analyzer.ts`.
OpenCode automatically loads it on next startup.

## How It Works

The plugin monitors two event types and invokes the Iris subagent when updates may be needed:

### Trigger 1: Todo Completion

When all in-progress todos are completed:
1. Plugin detects the change via `todo.updated` event
2. Extracts completed todo items
3. Invokes Iris subagent with completed todos and current dashboard
4. Iris analyzes and generates summary
5. Noctis receives: `🔔 [DASHBOARD UPDATE] Iris Analysis: <summary>`

### Trigger 2: Comrade Reports

When Comrades submit new reports (`queue/reports/*_report.yaml`):
1. Plugin detects the change via `file.watcher.updated` event
2. Extracts report file names
3. Invokes Iris subagent with report content and dashboard
4. Iris analyzes what sections need updating
5. Noctis receives: `🔔 [DASHBOARD UPDATE] Iris Analysis: <summary>`

## Iris Subagent Role

Iris analyzes:
- Current `dashboard.md` state
- New reports from queue/reports/
- Completed todos not yet in dashboard

Iris generates:
- Concise summary (2-3 sentences max)
- Specific guidance on what needs updating
- Direct, actionable recommendations

Model: `github-copilot/gpt-5-mini` (cost-efficient, specialized for quick analysis)

## Configuration

### Cooldown Duration

Edit cooldown duration by changing `REMINDER_COOLDOWN` constant:

```typescript
const REMINDER_COOLDOWN = 30000 // milliseconds (default: 30 seconds)
```

### Iris Model

Change the Iris analysis model by updating the `model` parameter in `invokeIrisSubagent`:

```typescript
model: "github-copilot/gpt-5-mini" // current: cost-efficient mini model
// Change to other models as needed
```

## Recent Updates (2026-02-14)

- **Iris Integration**: Replaced direct notifications with intelligent Iris subagent analysis
- **Dashboard Analysis**: Iris now reads dashboard.md and report files for comprehensive analysis
- **Friendly Summaries**: User-friendly output from Iris ("Iris Analysis: ...") instead of direct commands
- **Structured Prompting**: Iris uses system prompt and detailed user prompts for consistent analysis

## Logs

Plugin logs to OpenCode's structured logging system:

```typescript
await client.app.log({
  body: {
    service: "iris-analyzer",
    level: "info",
    message: "Iris analysis: <summary>",
  },
})
```

View logs with OpenCode's logging system.

## How Iris Analysis Works

When an event triggers, the plugin:

1. **Collects context**:
   - Reads current `dashboard.md`
   - Reads new report files from `queue/reports/`
   - Extracts completed todos or report names

2. **Constructs prompt**:
   ```
   System: "You are Iris, analyze dashboard and reports..."
   User: "Current Dashboard: <content>
           Completed Todos: <items>
           New Reports: <content>
           Please analyze and provide summary..."
   ```

3. **Invokes Iris**:
   - Uses `client.session.prompt()` API
   - Model: `github-copilot/gpt-5-mini`
   - Generates concise 2-3 sentence summary

4. **Delivers summary**:
   - Sends to Noctis via tmux
   - Logs analysis result
   - Respects 30-second cooldown

## Disable Plugin

To disable temporarily:
1. Rename file: `iris-dashboard-analyzer.ts.disabled`
2. Restart OpenCode

To re-enable:
1. Rename back to `.ts`
2. Restart OpenCode

## Notes

- Plugin uses cooldown to avoid spamming reminders
- Iris analysis ensures Noctis gets relevant, contextual guidance
- No manual YAML files needed — all analysis programmatic
- Works in tandem with Task Execution Checklist in `noctis.md`

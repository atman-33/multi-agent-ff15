# Dashboard Update Reminder Plugin

Automatically reminds Noctis to update `dashboard.md` after completing tasks.

## Features

- **Session Idle Detection**: Reminds when session becomes idle (work finished)
- **Todo Completion Tracking**: Alerts when todos are marked complete
- **Comrade Report Monitoring**: Detects when Comrades submit new reports
- **Smart Cooldown**: 1-minute cooldown between reminders to avoid spam

## Installation

Plugin is already installed in `.opencode/plugins/dashboard-update-reminder.ts`.
OpenCode automatically loads it on next startup.

## How It Works

### Trigger 1: Session Idle
When OpenCode session becomes idle (no active work), the plugin sends a reminder:

```
[SYSTEM REMINDER - DASHBOARD UPDATE]

Task appears complete. Have you updated dashboard.md?

Required updates:
1. Move completed tasks from "🔄 進行中" to "✅ 本日の成果"
2. Update "最終更新" timestamp
3. Clear "🚨 対応必要" if issues resolved
4. Add new results to top of results table
```

### Trigger 2: Todo Completion
When all in-progress todos are completed:

```
[SYSTEM REMINDER - TODO COMPLETION]

3 todo(s) completed. Update dashboard.md with results.

Completed items:
- Task A
- Task B
- Task C
```

### Trigger 3: Comrade Reports
When Comrades submit new reports in `queue/reports/`:

```
[SYSTEM REMINDER - COMRADE REPORTS]

New reports from: ignis, prompto

Check these files:
- queue/reports/ignis_report.yaml
- queue/reports/prompto_report.yaml
```

## Testing

1. Restart OpenCode to load the plugin
2. Complete a task and mark todos as done
3. Wait for session to become idle
4. Plugin should send reminder message

## Configuration

Edit cooldown duration by changing `REMINDER_COOLDOWN` constant:

```typescript
const REMINDER_COOLDOWN = 60000 // milliseconds (default: 1 minute)
```

## Logs

Plugin logs to OpenCode's structured logging system:

```typescript
await client.app.log({
  body: {
    service: "dashboard-reminder",
    level: "info",
    message: "Session idle - reminding to update dashboard",
  },
})
```

View logs with OpenCode's logging system.

## Disable Plugin

To disable temporarily:
1. Rename file: `dashboard-update-reminder.ts.disabled`
2. Restart OpenCode

To re-enable:
1. Rename back to `.ts`
2. Restart OpenCode

## Notes

- Plugin uses cooldown to avoid spamming reminders
- Works specifically for Noctis role in multi-agent-ff15 workflow
- Reminder messages appear as system messages in chat

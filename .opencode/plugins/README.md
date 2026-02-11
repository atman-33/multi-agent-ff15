# Dashboard Update Reminder Plugin

Automatically reminds Noctis to update `dashboard.md` via direct tmux send-keys notifications.

## Features

- **Todo Completion Tracking**: Alerts when all in-progress todos are completed
- **Comrade Report Monitoring**: Detects when Comrades submit new reports
- **Smart Cooldown**: 1-minute cooldown between reminders to avoid spam
- **Direct Notification**: Messages sent straight to Noctis pane via tmux send-keys — no intermediate files

## Installation

Plugin is already installed in `.opencode/plugins/dashboard-update-reminder.ts`.
OpenCode automatically loads it on next startup.

## How It Works

The plugin sends short reminder messages directly to the Noctis pane (ff15:0) via `tmux send-keys`. No YAML files are written — Noctis sees the message immediately in the pane input.

### Trigger 1: Todo Completion

When all in-progress todos are completed, Noctis receives:

```
⚠️ [Dashboard Reminder] 3 todo(s) completed: Task A, Task B, Task C — Please update dashboard.md
```

### Trigger 2: Comrade Reports

When Comrades submit new reports (`queue/reports/*_report.yaml`), Noctis receives:

```
⚠️ [Dashboard Reminder] New report(s) from: prompto — Please update dashboard.md
```

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
    message: "Notification sent to Noctis: ...",
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
- Notifications appear directly in Noctis pane via tmux send-keys
- No intermediate files — zero context overhead for Noctis

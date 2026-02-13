# Dashboard Update Reminder Plugin

Automatically reminds Noctis to update `dashboard.md` via direct tmux send-keys notifications.

## Features

- **Todo Completion Tracking**: Alerts when all in-progress todos are completed
- **Comrade Report Monitoring**: Detects when Comrades submit new reports
- **Smart Cooldown**: 30-second cooldown between reminders (reduced from 60s for faster response)
- **Direct Notification**: Messages sent straight to Noctis pane via tmux send-keys — no intermediate files
- **Enhanced Visibility**: Updated notification format with 🔔 emoji and "NOW" emphasis

## Installation

Plugin is already installed in `.opencode/plugins/dashboard-update-reminder.ts`.
OpenCode automatically loads it on next startup.

## How It Works

The plugin sends short reminder messages directly to the Noctis pane (ff15:0) via `tmux send-keys`. No YAML files are written — Noctis sees the message immediately in the pane input.

### Trigger 1: Todo Completion

When all in-progress todos are completed, Noctis receives:

```
🔔 [DASHBOARD UPDATE REQUIRED] 3 todo(s) completed: Task A, Task B, Task C — Update dashboard.md NOW
```

### Trigger 2: Comrade Reports

When Comrades submit new reports (`queue/reports/*_report.yaml`), Noctis receives:

```
🔔 [DASHBOARD UPDATE REQUIRED] New report(s) from: ignis, gladiolus, prompto — Update dashboard.md NOW (Phase 3 checklist)
```

## Configuration

Edit cooldown duration by changing `REMINDER_COOLDOWN` constant:

```typescript
const REMINDER_COOLDOWN = 30000 // milliseconds (default: 30 seconds)
```

## Recent Updates (2026-02-14)

- **Cooldown reduced**: 60s → 30s for faster response to Comrade reports
- **Enhanced notifications**: Changed from `⚠️ [Dashboard Reminder]` to `🔔 [DASHBOARD UPDATE REQUIRED]` with "NOW" emphasis
- **Phase reference**: Added "(Phase 3 checklist)" to Comrade report notifications to guide Noctis to correct checklist step

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
- Works in tandem with Task Execution Checklist in `noctis.md`

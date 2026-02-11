# Dashboard Update Reminder Plugin

Automatically reminds Noctis to update `dashboard.md` after completing tasks.

## Features

- **Session Idle Detection**: Reminds when session becomes idle (work finished)
- **Todo Completion Tracking**: Alerts when todos are marked complete
- **Comrade Report Monitoring**: Detects when Comrades submit new reports
- **Smart Cooldown**: 1-minute cooldown between reminders to avoid spam
- **Hybrid Notification System**: YAML queue + direct tmux messages for high-priority alerts

## Installation

Plugin is already installed in `.opencode/plugins/dashboard-update-reminder.ts`.
OpenCode automatically loads it on next startup.

## How It Works

### Notification System (Hybrid Approach)

The plugin uses two notification methods:

1. **YAML Queue** (`queue/plugin_notifications.yaml`)
   - All notifications are written here
   - Noctis checks this file periodically
   - Low-priority reminders (e.g., session idle)

2. **Direct tmux Notification** (via send-keys)
   - High-priority alerts sent directly to Noctis pane
   - Immediate visibility for critical events
   - Used for: todo completion, new Comrade reports

### Trigger 1: Session Idle (Low Priority)

When OpenCode session becomes idle, writes to YAML queue:

```yaml
notifications:
  - id: notif_001
    timestamp: "2026-02-11T23:52:13"
    service: dashboard-reminder
    message: |
      Session is idle. Please update dashboard.md:
      1. Move completed tasks to '✅ Today's Results'
      2. Update 'Last Updated' timestamp
      3. Clear '🚨 Requires Action' if resolved
      4. Add new achievements in chronological order
    priority: low
    status: pending
```

### Trigger 2: Todo Completion (High Priority)

When all in-progress todos are completed, sends direct notification + YAML:

**Direct message to Noctis pane:**
```
⚠️ [Dashboard Update Reminder] 3 todo(s) completed: Task A, Task B, Task C
Please add to '✅ Today's Results' section in dashboard.md
```

**YAML notification:**
```yaml
notifications:
  - id: notif_002
    timestamp: "2026-02-11T23:52:15"
    service: dashboard-reminder
    message: |
      3 todo(s) completed: Task A, Task B, Task C
      Please add to '✅ Today's Results' section in dashboard.md
    priority: high
    status: pending
    extra:
      completedCount: 3
```

### Trigger 3: Comrade Reports (High Priority)

When Comrades submit new reports, sends both direct + YAML notification.

## Noctis Integration

Noctis checks notifications in the "Check Everything When Woken" protocol:

1. Read `queue/plugin_notifications.yaml`
2. Process pending notifications
3. Update `dashboard.md` accordingly
4. Clear processed notifications

## Configuration

Edit cooldown duration by changing `REMINDER_COOLDOWN` constant:

```typescript
const REMINDER_COOLDOWN = 60000 // milliseconds (default: 1 minute)
```

## Priority Levels

| Priority | Delivery Method | Use Case |
|----------|----------------|----------|
| `low` | YAML only | Session idle, routine reminders |
| `high` | YAML + tmux | Todo completion, Comrade reports |

## Logs

Plugin logs to OpenCode's structured logging system:

```typescript
await client.app.log({
  body: {
    service: "dashboard-reminder",
    level: "info",
    message: "Notification written: ...",
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
- High-priority notifications appear immediately via tmux
- YAML queue ensures no notifications are lost (consistent with other queue files)
- Noctis-specific workflow integration


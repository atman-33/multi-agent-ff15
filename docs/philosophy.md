# Philosophy

> "Don't execute tasks mindlessly. Always keep 'fastest × best output' in mind."

The Noctis System is built on five core principles:

| Principle | Description |
|-----------|-------------|
| **Autonomous Formation** | Design task formations based on complexity, not templates |
| **Parallelization** | Use subagents to prevent single-point bottlenecks |
| **Research First** | Search for evidence before making decisions |
| **Continuous Learning** | Don't rely solely on model knowledge cutoffs |
| **Triangulation** | Multi-perspective research with integrated authorization |

---

## Design Philosophy

### Why hierarchical structure (Noctis→Comrades)?

1. **Instant response**: Noctis delegates immediately and returns control to you
2. **Parallel execution**: Distribute to multiple Comrades simultaneously
3. **Single responsibility**: Each role is clearly separated, no confusion
4. **Scalability**: Structure remains intact even when adding Comrades
5. **Fault isolation**: One Comrade's failure doesn't affect others
6. **Centralized reporting**: Only Noctis interacts with humans, keeping information organized
7. **Independent advisor**: Lunafreya operates independently and can command Noctis

### Why YAML + send-keys?

1. **State persistence**: Structured communication via YAML files survives agent restarts
2. **No polling needed**: Event-driven approach reduces API costs
3. **Interrupt prevention**: Prevents interruptions between agents or to your input
4. **Easy debugging**: Humans can directly read YAML to understand status
5. **Conflict avoidance**: Each Comrade has dedicated files
6. **2-second interval transmission**: Inserting `sleep 2` between consecutive sends to multiple Comrades prevents input buffer overflow (arrival rate improved from 14% to 87.5%)

### Why only Noctis updates dashboard.md?

1. **Single updater**: Limit update responsibility to one person to prevent conflicts
2. **Information aggregation**: Noctis receives reports from all Comrades and grasps the full picture
3. **Consistency**: All updates pass through one quality gate
4. **Interrupt prevention**: If Comrades updated, they could interrupt King during input

---

## Skills

Initially, there are no skills. During operation, approve candidates from the "Skill Candidates" section in the dashboard (dashboard.md) to add them.

Skills can be invoked with `/skillname`. Just tell Noctis "Execute /skillname".

### Skill Philosophy

**1. Skills are not committed**

Skills under `.opencode/skills/` are not committed to the repository by design. Reasons:
- Each user's work and workflow are different
- Rather than imposing generic skills, let users grow skills they need

**2. Skill acquisition process**

```
Comrade discovers pattern during work
    ↓
Appears in "Skill Candidates" in dashboard.md
    ↓
King (you) reviews content
    ↓
If approved, command Noctis to create skill
```

Skills are user-driven growth. Automatic growth leads to unmanageable proliferation, so keep only what you judge as "useful".

---

## Plugin System

### Dashboard Update Reminder

The system includes an automated dashboard update reminder plugin that helps Noctis stay on top of status updates.

#### How It Works

The plugin sends short reminder messages directly to the Noctis pane via `tmux send-keys`. No intermediate files are used — Noctis sees the message immediately.

#### Triggers

| Event | Notification |
|-------|-------------|
| Todo completion | `⚠️ [Dashboard Reminder] N todo(s) completed: ... — Please update dashboard.md` |
| Comrade reports | `⚠️ [Dashboard Reminder] New report(s) from: ... — Please update dashboard.md` |

#### Creating Custom Plugins

Plugins are stored in `.opencode/plugins/` and automatically loaded by OpenCode. See `.opencode/plugins/README.md` for detailed documentation on creating custom hooks.

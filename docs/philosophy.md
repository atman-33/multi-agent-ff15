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

### Why event-driven inbox communication?

1. **Single updater**: Limit update responsibility to one person to prevent conflicts
2. **Information aggregation**: Noctis receives reports from all Comrades and grasps the full picture
3. **Consistency**: All updates pass through one quality gate
4. **Interrupt prevention**: If Comrades updated, they could interrupt King during input

---

## Skills

Initially, there are no skills. During operation, Iris forwards skill candidates to Crystal inbox (`queue/inbox/crystal.yaml`) for your review.

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
Iris forwards to Crystal inbox
    ↓
King (you) reviews content
    ↓
If approved, command Noctis to create skill
```

Skills are user-driven growth. Automatic growth leads to unmanageable proliferation, so keep only what you judge as "useful".

---

## Plugin System

### Worklog Auto Updater

The system includes an automated worklog updater plugin that tracks task progress in `runtime/worklog.json`.

#### How It Works

The plugin monitors inbox file changes and updates `runtime/worklog.json` with In Progress and Today's Results. The desktop app displays this data on the Worklog page.

#### Triggers

| Event | Action |
|-------|--------|
| Task assigned | Added to worklog inProgress |
| Comrade reports | Moved from inProgress to results |

#### Creating Custom Plugins

Plugins are stored in `.opencode/plugins/` and automatically loaded by OpenCode. See `.opencode/plugins/README.md` for detailed documentation on creating custom hooks.

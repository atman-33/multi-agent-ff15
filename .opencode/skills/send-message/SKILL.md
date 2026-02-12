---
name: send-message
description: Send a tmux message to another agent in the FF15 multi-agent system. Use this skill whenever you need to notify or wake another agent via tmux send-keys — such as reporting to Noctis after completing a task, or Noctis assigning tasks to Comrades. This skill ensures correct pane targeting and the mandatory 2-call split pattern.
metadata:
  author: multi-agent-ff15
  version: "2.0"
  created: "2026-02-12"
---

# send-message

Send a tmux message to another agent in the FF15 session using `scripts/send.sh`.

## Usage

Run the script from the skill directory. The script resolves its own location, so it works from any CWD.

```bash
# Single message
.opencode/skills/send-message/scripts/send.sh <agent> "<message>"

# Multiple targets (2s interval between sends, handled automatically)
.opencode/skills/send-message/scripts/send.sh <agent1> "<msg1>" <agent2> "<msg2>" ...
```

### Example: Comrade → Noctis (report)

```bash
.opencode/skills/send-message/scripts/send.sh noctis "ignis の任務報告があります。queue/reports/ignis_report.yaml を確認してください。"
```

### Example: Noctis → Multiple Comrades

```bash
.opencode/skills/send-message/scripts/send.sh \
  ignis "queue/tasks/ignis.yaml に任務がある。確認して動いてくれ。" \
  gladiolus "queue/tasks/gladiolus.yaml に任務がある。確認して動いてくれ。" \
  prompto "queue/tasks/prompto.yaml に任務がある。確認して動いてくれ。"
```

## Agent Names

Valid agent names: `noctis`, `lunafreya`, `ignis`, `gladiolus`, `prompto`

## Critical Rules

1. **Write YAML before sending** — report/task YAML must be written first, then run the script
2. **Use the script** — do not manually call `tmux send-keys`; the script handles pane targeting, 2-call split, and intervals
3. **Dynamic pane lookup** (if pane drift is suspected):
   ```bash
   tmux list-panes -t ff15 -F '#{pane_index} #{@agent_id}'
   ```

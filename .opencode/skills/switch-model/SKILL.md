---
name: switch-model
description: Dynamically switch an FF15 agent's LLM model at runtime via OpenCode's /models command. Use when Noctis needs to upgrade a Comrade to a stronger model for complex tasks, or downgrade for cost optimization. The target agent must be idle (not executing a task).
metadata:
  author: multi-agent-ff15
  version: "1.0"
  created: "2026-02-12"
---

# switch-model

Dynamically switch an FF15 agent's LLM model using `scripts/switch.sh`.

## Usage

```bash
.opencode/skills/switch-model/scripts/switch.sh <agent_name> <model_keyword>
```

### Examples

```bash
# Upgrade Prompto to Opus for a complex task
.opencode/skills/switch-model/scripts/switch.sh prompto opus

# Downgrade Ignis to Haiku for a simple task
.opencode/skills/switch-model/scripts/switch.sh ignis haiku

# Switch Gladiolus to GPT-5-mini
.opencode/skills/switch-model/scripts/switch.sh gladiolus gpt-5-mini
```

## Model Keywords

| Keyword | Model |
|---------|-------|
| `gpt-5-mini` | GPT-5-mini |
| `sonnet` | Claude Sonnet 4.5 |
| `opus` | Claude Opus 4.6 |
| `haiku` | Claude Haiku 4.5 |
| `gemini` | Gemini models |
| `gpt-5.2-codex` | GPT-5.2-codex |
| `grok-code-fast-1` | Grok Code Fast 1 |

Check all available models: `opencode models`

## Prerequisites

- **Agent must be idle** — switching during active work may cause context loss
- If the agent's task status is `assigned`, wait for completion first

## Notes

- Session continuity is preserved (conversation history, tmux variables retained)
- This is a **temporary change** — `config/models.yaml` is not updated
- Execution time: ~3 seconds

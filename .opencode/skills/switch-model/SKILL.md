---
name: switch-model
description: Dynamically switch an FF15 agent's LLM model at runtime via OpenCode's /models command. Use when Noctis needs to upgrade a Comrade to a stronger model for complex tasks, or downgrade for cost optimization. The target agent must be idle (not executing a task).
metadata:
  author: multi-agent-ff15
  version: "1.0"
  created: "2026-02-12"
---

# switch-model

Dynamically switch an FF15 agent's LLM model using `scripts/switch-model.sh`.

## Usage

```bash
scripts/switch-model.sh <agent_name> <model_keyword>
```

### Examples

```bash
# Upgrade Prompto to Opus for a complex task
scripts/switch-model.sh prompto "Claude Opus 4.6"

# Downgrade Ignis to Haiku for a simple task
scripts/switch-model.sh ignis "Claude Haiku 4.5"

# Switch Gladiolus to GPT-5-mini
scripts/switch-model.sh gladiolus "GPT-5-mini"
```

## Model Keywords

The available model keywords are managed dynamically. See the following sources:
- Desktop/Web UI and valid arguments: `config/models.yaml` (see `model_definitions`)
- Check all available models via OpenCode CLI: `opencode models`

## Prerequisites

- **Agent must be idle** — switching during active work may cause context loss
- If the agent's task status is `assigned`, wait for completion first

## Notes

- Session continuity is preserved (conversation history, tmux variables retained)
- This is a **temporary change** — `config/models.yaml` is not updated
- Execution time: ~3 seconds

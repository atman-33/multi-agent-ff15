#!/usr/bin/env bash
# switch-model: Dynamically switch an FF15 agent's model via OpenCode /models command
#
# Usage:
#   switch.sh <agent_name> <model_keyword>
#
# Examples:
#   switch.sh prompto gpt-5-mini
#   switch.sh ignis opus
#   switch.sh gladiolus haiku
#
# The agent must be in idle state (not executing a task).

set -euo pipefail

# Agent name → pane index mapping
declare -A PANE_INDEX=(
  [noctis]=0
  [lunafreya]=1
  [ignis]=2
  [gladiolus]=3
  [prompto]=4
)

# --- Argument validation ---
if [[ $# -ne 2 ]]; then
  echo "Usage: switch.sh <agent_name> <model_keyword>" >&2
  echo "" >&2
  echo "Model keywords: gpt-5-mini, sonnet, opus, haiku, gemini, grok-code-fast-1, gpt-5.2-codex" >&2
  exit 1
fi

agent="$1"
model="$2"
pane="${PANE_INDEX[$agent]:-}"

if [[ -z "$pane" ]]; then
  echo "ERROR: Unknown agent '$agent'. Valid: ${!PANE_INDEX[*]}" >&2
  exit 1
fi

target="ff15:main.${pane}"

# Step 1: Send /models command
tmux send-keys -t "$target" '/models'
tmux send-keys -t "$target" Enter

# Step 2: Wait for UI to appear
sleep 2

# Step 3: Send model search keyword
tmux send-keys -t "$target" "$model"
tmux send-keys -t "$target" Enter

echo "Model switch sent: $agent ($target) → $model"
echo "Note: This is a temporary change (config/models.yaml is not updated)"

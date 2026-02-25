#!/usr/bin/env bash
# scripts/get-current-model.sh
# Retrieves the current model name for the specified agent from the tmux pane.

set -euo pipefail

declare -A PANE_INDEX=(
  [noctis]=0
  [lunafreya]=1
  [ignis]=2
  [gladiolus]=3
  [prompto]=4
  [iris]=5
)

if [[ $# -ne 1 ]]; then
  echo "Usage: get-current-model.sh <agent_name>" >&2
  exit 1
fi

agent="${1,,}" # lowercase
pane="${PANE_INDEX[$agent]:-}"

if [[ -z "$pane" ]]; then
  echo "ERROR: Unknown agent '$agent'. Valid: ${!PANE_INDEX[*]}" >&2
  exit 1
fi

target="ff15:main.${pane}"
agent_capitalized="${agent^}"

# Capture pane content with -J (join wrapped lines) so that provider names
# split across lines due to narrow terminal widths are rejoined into one line.
# Example: "OpenCode\nZen" → "OpenCode Zen" on a single line.
matched_line=$(tmux capture-pane -t "$target" -p -J | grep -E "^[[:space:]]*┃[[:space:]]*${agent_capitalized}[[:space:]]+" | tail -n 1 || true)

if [[ -z "$matched_line" ]]; then
  echo "ERROR: Could not find status line for $agent in pane $target" >&2
  exit 1
fi

# Extract the model string between Agent Name and Provider.
# Example line: "  ┃  Gladiolus  Trinity Large Preview  OpenCode Zen"
# \1 captures the model part.
model=$(echo "$matched_line" | sed -E "s/^[[:space:]]*┃[[:space:]]*${agent_capitalized}[[:space:]]+(.*)[[:space:]]+(GitHub Copilot|OpenCode Zen).*$/\1/")

# Trim trailing whitespace
model=$(echo "$model" | sed -e 's/[[:space:]]*$//')

if [[ "$model" == "$matched_line" ]]; then
  # Regex didn't match — provider keyword not found in the line
  echo "ERROR: Failed to parse provider from line: $matched_line" >&2
  exit 1
fi

echo "$model"

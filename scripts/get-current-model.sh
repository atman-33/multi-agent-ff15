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

# Capture the pane output. To handle cases where the provider name spans
# two lines (e.g. "OpenCode\nZen"), we fetch the matching line AND the next
# line, then join them with a space before parsing.
raw_output=$(tmux capture-pane -t "$target" -p)

# Use grep -A1 to get the matched line plus the immediately following line,
# then collapse newlines into spaces to create a single line for sed parsing.
matched_line=$(echo "$raw_output" | grep -A1 -E "^[[:space:]]*┃[[:space:]]*${agent_capitalized}[[:space:]]+" | tail -n 2 | tr '\n' ' ' || true)

# strip the trailing "--" separator that grep -A adds between non-adjacent matches
matched_line="${matched_line%--*}"

if [[ -z "${matched_line// /}" ]]; then
  echo "ERROR: Could not find status line for $agent in pane $target" >&2
  exit 1
fi

# Extract the model string between Agent Name and Provider.
# The joined line may look like:
#   "  ┃  Gladiolus  Trinity Large Preview  OpenCode Zen "
# or (single-line case):
#   "  ┃  Lunafreya  MiniMax M2.5 Free (OpenCode Zen)"
# \1 captures the model part.
model=$(echo "$matched_line" | sed -E "s/^[[:space:]]*┃[[:space:]]*${agent_capitalized}[[:space:]]+(.*)[[:space:]]+(GitHub Copilot|OpenCode Zen).*$/\1/")

# Trim trailing whitespace
model=$(echo "$model" | sed -e 's/[[:space:]]*$//')

if [[ "$model" == "$matched_line" ]]; then
  # Regex didn't match — provider keyword not found even after line-join
  echo "ERROR: Failed to parse provider from line: $matched_line" >&2
  exit 1
fi

echo "$model"

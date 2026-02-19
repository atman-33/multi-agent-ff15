#!/usr/bin/env bash
# busy_detect.sh: Check if an agent is busy or idle via tmux pane inspection
#
# Usage: busy_detect.sh <agent_name>
# Exit codes: 0=IDLE, 1=BUSY, 2=ERROR (treated as IDLE for fallback)
# Timeout: 2 seconds

set -uo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: busy_detect.sh <agent_name>" >&2
  exit 2
fi

AGENT="$1"

declare -A PANE_MAP=(
  [noctis]="ff15:main.0"
  [lunafreya]="ff15:main.1"
  [ignis]="ff15:main.2"
  [gladiolus]="ff15:main.3"
  [prompto]="ff15:main.4"
  [iris]="ff15:main.5"
)

TARGET="${PANE_MAP[$AGENT]:-}"
if [[ -z "$TARGET" ]]; then
  echo "ERROR: Unknown agent '$AGENT'" >&2
  exit 2
fi

PANE_OUTPUT=$(timeout 2 tmux capture-pane -t "$TARGET" -p 2>/dev/null | tail -5) || {
  echo "Busy detection: $AGENT TIMEOUT/ERROR, assuming IDLE"
  exit 0
}

PANE_LOWER=$(echo "$PANE_OUTPUT" | tr '[:upper:]' '[:lower:]')

BUSY_MARKERS=("working" "thinking" "esc to interrupt")
for marker in "${BUSY_MARKERS[@]}"; do
  if echo "$PANE_LOWER" | grep -q "$marker"; then
    echo "Busy detection: $AGENT BUSY (marker: $marker)"
    exit 1
  fi
done

IDLE_MARKERS=("❯ " "› ")
for marker in "${IDLE_MARKERS[@]}"; do
  if echo "$PANE_OUTPUT" | grep -q "$marker"; then
    echo "Busy detection: $AGENT IDLE (marker: $marker)"
    exit 0
  fi
done

echo "Busy detection: $AGENT UNKNOWN, assuming IDLE"
exit 0

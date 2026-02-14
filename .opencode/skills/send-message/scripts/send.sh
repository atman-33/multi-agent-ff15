#!/usr/bin/env bash
# send-message: Send a tmux message to an FF15 agent
#
# Usage:
#   send.sh <agent_name> <message>
#   send.sh <agent1> <msg1> <agent2> <msg2> ...  (multi-send with 2s intervals)
#
# Examples:
#   send.sh noctis "Ignis の任務報告があります。queue/reports/ignis_report.yaml を確認してください。"
#   send.sh ignis "queue/tasks/ignis.yaml に任務がある。確認して動いてくれ。" gladiolus "queue/tasks/gladiolus.yaml に任務がある。確認して動いてくれ。"

set -euo pipefail

# Agent name → pane target mapping
declare -A PANE_MAP=(
  [noctis]="ff15:main.0"
  [lunafreya]="ff15:main.1"
  [ignis]="ff15:main.2"
  [gladiolus]="ff15:main.3"
  [prompto]="ff15:main.4"
  [iris]="ff15:main.5"
)

send_one() {
  local agent="$1"
  local message="$2"
  local target="${PANE_MAP[$agent]:-}"

  if [[ -z "$target" ]]; then
    echo "ERROR: Unknown agent '$agent'. Valid: ${!PANE_MAP[*]}" >&2
    return 1
  fi

  # [1st] Send message
  tmux send-keys -t "$target" "$message"
  # [2nd] Send Enter
  tmux send-keys -t "$target" Enter

  echo "Sent to $agent ($target)"
}

# --- Argument validation ---
if [[ $# -lt 2 ]]; then
  echo "Usage: send.sh <agent> <message> [<agent2> <message2> ...]" >&2
  exit 1
fi

if [[ $(( $# % 2 )) -ne 0 ]]; then
  echo "ERROR: Arguments must be in <agent> <message> pairs." >&2
  exit 1
fi

# --- Send messages ---
first=true
while [[ $# -ge 2 ]]; do
  if [[ "$first" == true ]]; then
    first=false
  else
    sleep 2
  fi
  send_one "$1" "$2"
  shift 2
done

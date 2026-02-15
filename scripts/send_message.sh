#!/usr/bin/env bash
# send-message: Send messages between FF15 agents via inbox
# Notification is handled automatically by inbox-auto-notify plugin
#
# Usage:
#   send_message.sh <from_agent> <to_agent> "<message>" [priority]
#
# Options:
#   from_agent: Sender agent name (noctis, lunafreya, ignis, gladiolus, prompto, iris)
#   to_agent:   Target agent name
#   message:    Message content
#   priority:   low, medium, high (default: medium)
#
# Examples:
#   # Lunafreya → Noctis
#   send_message.sh lunafreya noctis "調査をお願いします" "high"
#
#   # Noctis → Lunafreya
#   send_message.sh noctis lunafreya "承知しました" "medium"
#
#   # Noctis → Comrade
#   send_message.sh noctis ignis "タスクを確認してください"

set -euo pipefail

# --- Argument parsing ---
if [[ $# -lt 3 ]]; then
  cat << 'EOF' >&2
Usage: send_message.sh <from_agent> <to_agent> "<message>" [priority]

Arguments:
  from_agent   Sender agent name
  to_agent     Target agent name
  message      Message content
  priority     low, medium, high (default: medium)

Examples:
  send_message.sh lunafreya noctis "調査をお願い" "high"
  send_message.sh noctis ignis "確認してください"
EOF
  exit 1
fi

FROM_AGENT="$1"
TO_AGENT="$2"
MESSAGE="$3"
PRIORITY="${4:-medium}"

# --- Validation ---
VALID_AGENTS=("noctis" "lunafreya" "ignis" "gladiolus" "prompto" "iris")
VALID_PRIORITIES=("low" "medium" "high")

validate_agent() {
  local agent="$1"
  local role="$2"
  if [[ ! " ${VALID_AGENTS[*]} " =~ " ${agent} " ]]; then
    echo "ERROR: Invalid ${role} agent '${agent}'. Valid: ${VALID_AGENTS[*]}" >&2
    exit 1
  fi
}

validate_agent "$FROM_AGENT" "from"
validate_agent "$TO_AGENT" "to"

if [[ ! " ${VALID_PRIORITIES[*]} " =~ " ${PRIORITY} " ]]; then
  echo "ERROR: Invalid priority '${PRIORITY}'. Valid: ${VALID_PRIORITIES[*]}" >&2
  exit 1
fi

# --- ID and timestamp generation ---
MSG_ID="msg_$(date +%s)_$(head -c 4 /dev/urandom | xxd -p)"
TIMESTAMP=$(date "+%Y-%m-%dT%H:%M:%S")

# --- Resolve paths ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# --- Build YAML content ---
YAML_CONTENT=$(cat << EOF
message:
  message_id: ${MSG_ID}
  from: ${FROM_AGENT}
  to: ${TO_AGENT}
  description: "${MESSAGE}"
  priority: ${PRIORITY}
  timestamp: "${TIMESTAMP}"
EOF
)

# --- Write to inbox ---
INBOX_SCRIPT="${REPO_ROOT}/scripts/inbox_write.sh"
if [[ -x "$INBOX_SCRIPT" ]]; then
  "$INBOX_SCRIPT" "$TO_AGENT" "$FROM_AGENT" "message" "${YAML_CONTENT}" 2>/dev/null || true
else
  echo "ERROR: inbox_write.sh not found at ${INBOX_SCRIPT}" >&2
  exit 1
fi

echo "✅ Message ${MSG_ID}: ${FROM_AGENT} → ${TO_AGENT}"
echo "   Notification will be sent automatically by inbox-auto-notify plugin"

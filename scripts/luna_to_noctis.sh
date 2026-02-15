#!/usr/bin/env bash
# luna-to-noctis: Send message from Lunafreya to Noctis with automated YAML generation
#
# Usage:
#   luna_to_noctis.sh "<description>" [priority] [in_reply_to]
#
# Examples:
#   luna_to_noctis.sh "Investigate performance bottleneck in API"
#   luna_to_noctis.sh "What do you think about this approach?" "high"
#   luna_to_noctis.sh "Investigation complete" "medium" "noct_msg_1234567890"

set -euo pipefail

# --- Argument validation ---
if [[ $# -lt 1 ]]; then
  echo "Usage: luna_to_noctis.sh \"<description>\" [priority] [in_reply_to]" >&2
  echo "  priority: low, medium, high (default: medium)" >&2
  echo "  in_reply_to: message_id to reply to (optional)" >&2
  exit 1
fi

DESCRIPTION="$1"
PRIORITY="${2:-medium}"
IN_REPLY_TO="${3:-null}"

# Valid priority values
VALID_PRIORITY=("low" "medium" "high")
if [[ ! " ${VALID_PRIORITY[*]} " =~ " ${PRIORITY} " ]]; then
  echo "ERROR: Invalid priority '$PRIORITY'. Valid: ${VALID_PRIORITY[*]}" >&2
  exit 1
fi

# --- ID and timestamp generation ---
MSG_ID="luna_msg_$(date +%s)"
TIMESTAMP=$(date "+%Y-%m-%dT%H:%M:%S")

# --- Resolve script directory (works from any CWD) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

YAML_CONTENT=$(cat << EOF
# Lunafreya → Noctis communication channel
message:
  message_id: ${MSG_ID}
  in_reply_to: ${IN_REPLY_TO}
  description: "${DESCRIPTION}"
  priority: ${PRIORITY}
  timestamp: "${TIMESTAMP}"
EOF
)
"${REPO_ROOT}/scripts/yaml_write_flock.sh" "${REPO_ROOT}/queue/lunafreya_to_noctis.yaml" "$YAML_CONTENT"

INBOX_SCRIPT="${REPO_ROOT}/scripts/inbox_write.sh"
if [[ -x "$INBOX_SCRIPT" ]]; then
  "$INBOX_SCRIPT" "noctis" "lunafreya" "luna_instruction" "${DESCRIPTION}" 2>/dev/null || true
fi

WAKE_MSG="Lunafreya からのレターがあります"

echo "✅ Message sent to Noctis (${MSG_ID})"

# --- Wake Noctis via send.sh ---
"${REPO_ROOT}/scripts/send.sh" noctis "$WAKE_MSG"

#!/usr/bin/env bash
# noctis-to-luna: Send message from Noctis to Lunafreya with automated YAML generation
#
# Usage:
#   noctis_to_luna.sh "<description>" [type] [priority] [in_reply_to]
#
# Examples:
#   noctis_to_luna.sh "Investigation complete. Root cause identified." "response" "medium" "luna_msg_1234567890"
#   noctis_to_luna.sh "What's your take on this technical decision?" "consultation" "high"
#   noctis_to_luna.sh "Please review this approach" "instruction" "medium"

set -euo pipefail

# --- Argument validation ---
if [[ $# -lt 1 ]]; then
  echo "Usage: noctis_to_luna.sh \"<description>\" [type] [priority] [in_reply_to]" >&2
  echo "  type: instruction, consultation, response, info (default: response)" >&2
  echo "  priority: low, medium, high (default: medium)" >&2
  echo "  in_reply_to: message_id to reply to (optional)" >&2
  exit 1
fi

DESCRIPTION="$1"
TYPE="${2:-response}"
PRIORITY="${3:-medium}"
IN_REPLY_TO="${4:-null}"

# Valid type values
VALID_TYPE=("instruction" "consultation" "response" "info")
if [[ ! " ${VALID_TYPE[*]} " =~ " ${TYPE} " ]]; then
  echo "ERROR: Invalid type '$TYPE'. Valid: ${VALID_TYPE[*]}" >&2
  exit 1
fi

# Valid priority values
VALID_PRIORITY=("low" "medium" "high")
if [[ ! " ${VALID_PRIORITY[*]} " =~ " ${PRIORITY} " ]]; then
  echo "ERROR: Invalid priority '$PRIORITY'. Valid: ${VALID_PRIORITY[*]}" >&2
  exit 1
fi

# --- ID and timestamp generation ---
MSG_ID="noct_msg_$(date +%s)"
TIMESTAMP=$(date "+%Y-%m-%dT%H:%M:%S")

# --- Resolve script directory (works from any CWD) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"

# --- YAML generation ---
cat > "${REPO_ROOT}/queue/noctis_to_lunafreya.yaml" << EOF
# Noctis → Lunafreya communication channel
message:
  message_id: ${MSG_ID}
  type: ${TYPE}
  in_reply_to: ${IN_REPLY_TO}
  description: "${DESCRIPTION}"
  priority: ${PRIORITY}
  timestamp: "${TIMESTAMP}"
EOF

# --- Determine wake message based on type ---
case "$TYPE" in
  instruction)
    WAKE_MSG="Noctis からの指示があります"
    ;;
  consultation)
    WAKE_MSG="Noctis からの相談があります"
    ;;
  response)
    WAKE_MSG="Noctis からの返信があります"
    ;;
  info)
    WAKE_MSG="Noctis からの連絡があります"
    ;;
esac

echo "✅ Message sent to Lunafreya (${MSG_ID}, type: ${TYPE})"

# --- Wake Lunafreya via send-message ---
"${REPO_ROOT}/.opencode/skills/send-message/scripts/send.sh" lunafreya "$WAKE_MSG"

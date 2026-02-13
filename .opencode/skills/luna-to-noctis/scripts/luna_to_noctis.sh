#!/usr/bin/env bash
# luna-to-noctis: Send message from Lunafreya to Noctis with automated YAML generation
#
# Usage:
#   luna_to_noctis.sh "<description>" [type] [priority] [in_reply_to]
#
# Examples:
#   luna_to_noctis.sh "Investigate performance bottleneck in API" "instruction" "high"
#   luna_to_noctis.sh "What do you think about this approach?" "consultation" "medium"
#   luna_to_noctis.sh "Investigation complete" "response" "medium" "noct_msg_1234567890"

set -euo pipefail

# --- Argument validation ---
if [[ $# -lt 1 ]]; then
  echo "Usage: luna_to_noctis.sh \"<description>\" [type] [priority] [in_reply_to]" >&2
  echo "  type: instruction, consultation, response, info (default: instruction)" >&2
  echo "  priority: low, medium, high (default: medium)" >&2
  echo "  in_reply_to: message_id to reply to (optional)" >&2
  exit 1
fi

DESCRIPTION="$1"
TYPE="${2:-instruction}"
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
MSG_ID="luna_msg_$(date +%s)"
TIMESTAMP=$(date "+%Y-%m-%dT%H:%M:%S")

# --- Resolve script directory (works from any CWD) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"

# --- YAML generation ---
cat > "${REPO_ROOT}/queue/lunafreya_to_noctis.yaml" << EOF
# Lunafreya → Noctis communication channel
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
    WAKE_MSG="Lunafreya からの指示があります"
    ;;
  consultation)
    WAKE_MSG="Lunafreya からの相談があります"
    ;;
  response)
    WAKE_MSG="Lunafreya からの返信があります"
    ;;
  info)
    WAKE_MSG="Lunafreya からの連絡があります"
    ;;
esac

echo "✅ Message sent to Noctis (${MSG_ID}, type: ${TYPE})"

# --- Wake Noctis via send-message ---
"${REPO_ROOT}/.opencode/skills/send-message/scripts/send.sh" noctis "$WAKE_MSG"

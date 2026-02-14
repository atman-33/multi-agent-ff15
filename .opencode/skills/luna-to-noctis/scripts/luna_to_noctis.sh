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
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"

# --- YAML generation ---
cat > "${REPO_ROOT}/queue/lunafreya_to_noctis.yaml" << EOF
# Lunafreya → Noctis communication channel
message:
  message_id: ${MSG_ID}
  in_reply_to: ${IN_REPLY_TO}
  description: "${DESCRIPTION}"
  priority: ${PRIORITY}
  timestamp: "${TIMESTAMP}"
EOF

WAKE_MSG="Lunafreya からのレターがあります"

echo "✅ Message sent to Noctis (${MSG_ID})"

# --- Wake Noctis via send-message ---
"${REPO_ROOT}/.opencode/skills/send-message/scripts/send.sh" noctis "$WAKE_MSG"

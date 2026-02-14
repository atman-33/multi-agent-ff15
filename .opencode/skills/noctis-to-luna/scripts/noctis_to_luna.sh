#!/usr/bin/env bash
# noctis-to-luna: Send message from Noctis to Lunafreya with automated YAML generation
#
# Usage:
#   noctis_to_luna.sh "<description>" [priority] [in_reply_to]
#
# Examples:
#   noctis_to_luna.sh "Investigation complete. Root cause identified." "medium" "luna_msg_1234567890"
#   noctis_to_luna.sh "What's your take on this technical decision?" "high"
#   noctis_to_luna.sh "Please review this approach" "medium"

set -euo pipefail

# --- Argument validation ---
if [[ $# -lt 1 ]]; then
  echo "Usage: noctis_to_luna.sh \"<description>\" [priority] [in_reply_to]" >&2
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
  in_reply_to: ${IN_REPLY_TO}
  description: "${DESCRIPTION}"
  priority: ${PRIORITY}
  timestamp: "${TIMESTAMP}"
EOF

# --- Unified wake message ---
WAKE_MSG="Noctis からのお便りです"

echo "✅ Message sent to Lunafreya (${MSG_ID})"

# --- Wake Lunafreya via send-message ---
"${REPO_ROOT}/.opencode/skills/send-message/scripts/send.sh" lunafreya "$WAKE_MSG"

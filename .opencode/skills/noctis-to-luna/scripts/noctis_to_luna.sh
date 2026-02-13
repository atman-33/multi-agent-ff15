#!/usr/bin/env bash
# noctis-to-luna: Send response from Noctis to Lunafreya with automated YAML generation
#
# Usage:
#   noctis_to_luna.sh "<original_command_id>" "<description>"
#
# Examples:
#   noctis_to_luna.sh "luna_cmd_1707878400" "Investigation complete. Root cause identified."
#   noctis_to_luna.sh "luna_cmd_1707878401" "Review completed. No issues found."

set -euo pipefail

# --- Argument validation ---
if [[ $# -lt 2 ]]; then
  echo "Usage: noctis_to_luna.sh \"<original_command_id>\" \"<description>\"" >&2
  exit 1
fi

ORIGINAL_CMD_ID="$1"
DESCRIPTION="$2"

# --- ID and timestamp generation ---
RESP_ID="noct_resp_$(date +%s)"
TIMESTAMP=$(date "+%Y-%m-%dT%H:%M:%S")

# --- Resolve script directory (works from any CWD) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"

# --- YAML generation ---
cat > "${REPO_ROOT}/queue/noctis_to_lunafreya.yaml" << EOF
# Noctis → Lunafreya response channel
response:
  response_id: "${RESP_ID}"
  original_command_id: "${ORIGINAL_CMD_ID}"
  description: "${DESCRIPTION}"
  status: responded
  timestamp: "${TIMESTAMP}"
EOF

echo "✅ Response sent to Lunafreya (${RESP_ID})"

# --- Wake Lunafreya via send-message ---
"${REPO_ROOT}/.opencode/skills/send-message/scripts/send.sh" lunafreya "Noctis からの返信があります"

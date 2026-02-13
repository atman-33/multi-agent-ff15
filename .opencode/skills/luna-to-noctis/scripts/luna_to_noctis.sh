#!/usr/bin/env bash
# luna-to-noctis: Send instruction from Lunafreya to Noctis with automated YAML generation
#
# Usage:
#   luna_to_noctis.sh "<description>" [priority]
#
# Examples:
#   luna_to_noctis.sh "Investigate performance bottleneck in API" "high"
#   luna_to_noctis.sh "Review recent changes to authentication module"

set -euo pipefail

# --- Argument validation ---
if [[ $# -lt 1 ]]; then
  echo "Usage: luna_to_noctis.sh \"<description>\" [priority]" >&2
  exit 1
fi

DESCRIPTION="$1"
PRIORITY="${2:-medium}"

# Valid priority values
VALID_PRIORITY=("low" "medium" "high")
if [[ ! " ${VALID_PRIORITY[*]} " =~ " ${PRIORITY} " ]]; then
  echo "ERROR: Invalid priority '$PRIORITY'. Valid: ${VALID_PRIORITY[*]}" >&2
  exit 1
fi

# --- ID and timestamp generation ---
CMD_ID="luna_cmd_$(date +%s)"
TIMESTAMP=$(date "+%Y-%m-%dT%H:%M:%S")

# --- Resolve script directory (works from any CWD) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"

# --- YAML generation ---
cat > "${REPO_ROOT}/queue/lunafreya_to_noctis.yaml" << EOF
# Lunafreya → Noctis coordination channel
command:
  command_id: ${CMD_ID}
  description: "${DESCRIPTION}"
  priority: ${PRIORITY}
  status: pending
  timestamp: "${TIMESTAMP}"
EOF

echo "✅ Instruction sent to Noctis (${CMD_ID})"

# --- Wake Noctis via send-message ---
"${REPO_ROOT}/.opencode/skills/send-message/scripts/send.sh" noctis "Lunafreya からの指示があります"

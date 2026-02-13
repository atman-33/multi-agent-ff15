#!/usr/bin/env bash
# send-task: Assign task to Comrade with automated YAML generation
#
# Usage:
#   send_task.sh <agent_name> "<description>" [target_path] [parent_cmd]
#
# Examples:
#   send_task.sh ignis "Analyze YAML patterns in codebase" "/home/atman/repos/multi-agent-ff15"
#   send_task.sh gladiolus "Implement feature X" "/path/to/project" "cmd_001"

set -euo pipefail

# --- Argument validation ---
if [[ $# -lt 2 ]]; then
  echo "Usage: send_task.sh <agent_name> \"<description>\" [target_path] [parent_cmd]" >&2
  exit 1
fi

AGENT_NAME="$1"
DESCRIPTION="$2"
TARGET_PATH="${3:-null}"
PARENT_CMD="${4:-null}"

# Valid agent names
VALID_AGENTS=("ignis" "gladiolus" "prompto")
if [[ ! " ${VALID_AGENTS[*]} " =~ " ${AGENT_NAME} " ]]; then
  echo "ERROR: Invalid agent name '$AGENT_NAME'. Valid: ${VALID_AGENTS[*]}" >&2
  exit 1
fi

# --- ID and timestamp generation ---
TASK_ID="task_$(date +%s)"
TIMESTAMP=$(date "+%Y-%m-%dT%H:%M:%S")

# --- Resolve script directory (works from any CWD) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"

# --- YAML generation ---
cat > "${REPO_ROOT}/queue/tasks/${AGENT_NAME}.yaml" << EOF
# ${AGENT_NAME} task file
task:
  task_id: ${TASK_ID}
  parent_cmd: ${PARENT_CMD}
  description: "${DESCRIPTION}"
  target_path: ${TARGET_PATH}
  status: assigned
  timestamp: "${TIMESTAMP}"
EOF

echo "✅ Task assigned to ${AGENT_NAME} (${TASK_ID})"

# --- Wake agent via send-message ---
"${REPO_ROOT}/.opencode/skills/send-message/scripts/send.sh" "${AGENT_NAME}" "Task assigned. Read queue/tasks/${AGENT_NAME}.yaml"

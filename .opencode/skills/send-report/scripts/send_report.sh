#!/usr/bin/env bash
# send-report: Report task completion to Noctis with automated YAML generation
#
# Usage:
#   send_report.sh "<task_id>" "<status>" "<summary>" [details] [skill_candidate]
#
# Examples:
#   send_report.sh "task_1707878400" "done" "Analysis completed successfully"
#   send_report.sh "task_1707878401" "done" "Feature implemented" "Added OAuth support\nTested with 3 providers" "oauth-integration"

set -euo pipefail

# --- Argument validation ---
if [[ $# -lt 3 ]]; then
  echo "Usage: send_report.sh \"<task_id>\" \"<status>\" \"<summary>\" [details] [skill_candidate]" >&2
  exit 1
fi

TASK_ID="$1"
STATUS="$2"
SUMMARY="$3"
DETAILS="${4:-}"
SKILL_CANDIDATE="${5:-null}"

# Valid status values
VALID_STATUS=("done" "failed")
if [[ ! " ${VALID_STATUS[*]} " =~ " ${STATUS} " ]]; then
  echo "ERROR: Invalid status '$STATUS'. Valid: ${VALID_STATUS[*]}" >&2
  exit 1
fi

# --- Auto-detect agent ID ---
AGENT_ID=$(tmux display-message -t "$TMUX_PANE" -p '#{@agent_id}')

if [[ -z "$AGENT_ID" ]]; then
  echo "ERROR: Could not detect agent ID from tmux pane. Are you running in ff15 session?" >&2
  exit 1
fi

# Validate agent is a Comrade
VALID_AGENTS=("ignis" "gladiolus" "prompto")
if [[ ! " ${VALID_AGENTS[*]} " =~ " ${AGENT_ID} " ]]; then
  echo "ERROR: This skill is for Comrades only. Detected: $AGENT_ID" >&2
  exit 1
fi

# --- Timestamp generation ---
TIMESTAMP=$(date "+%Y-%m-%dT%H:%M:%S")

# --- Resolve script directory (works from any CWD) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"

DETAILS_EXPANDED=$(echo -e "$DETAILS")

YAML_CONTENT=$(cat << EOF
report:
  task_id: "${TASK_ID}"
  status: ${STATUS}
  summary: "${SUMMARY}"
  details: |
$(if [[ -n "$DETAILS_EXPANDED" ]]; then echo "$DETAILS_EXPANDED" | sed 's/^/    /'; else echo "    (No additional details)"; fi)
  skill_candidate: ${SKILL_CANDIDATE}
  timestamp: "${TIMESTAMP}"
EOF
)
"${REPO_ROOT}/scripts/yaml_write_flock.sh" "${REPO_ROOT}/queue/reports/${AGENT_ID}_report.yaml" "$YAML_CONTENT"

INBOX_SCRIPT="${REPO_ROOT}/scripts/inbox_write.sh"
if [[ -x "$INBOX_SCRIPT" ]]; then
  "$INBOX_SCRIPT" "noctis" "$AGENT_ID" "report_received" "queue/reports/${AGENT_ID}_report.yaml updated (${TASK_ID})" 2>/dev/null || true
fi

echo "✅ Report submitted by ${AGENT_ID} (${TASK_ID})"

# --- Wake Noctis via send-message ---
"${REPO_ROOT}/.opencode/skills/send-message/scripts/send.sh" noctis "Report ready: ${TASK_ID}"

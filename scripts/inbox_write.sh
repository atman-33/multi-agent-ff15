#!/usr/bin/env bash
# inbox_write.sh: Atomic message append to agent inbox with flock protection
#
# Usage: inbox_write.sh <agent> <from> <type> <content>
# Exit codes: 0=success, 1=lock timeout, 2=YAML error
# Message ID format: msg_YYYYMMDD_HHMMSS_XXXXXXXX
# Overflow: keeps all unread + newest 30 read, max 50 total

set -uo pipefail

if [[ $# -lt 4 ]]; then
  echo "Usage: inbox_write.sh <agent> <from> <type> <content>" >&2
  exit 2
fi

AGENT="$1"
FROM="$2"
MSG_TYPE="$3"
MSG_CONTENT="$4"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
INBOX_DIR="${REPO_ROOT}/queue/inbox"
INBOX_FILE="${INBOX_DIR}/${AGENT}.yaml"
LOCK_FILE="${INBOX_FILE}.lock"
TMP_FILE="${INBOX_FILE}.tmp"
AGENT_MSG_LOG="${REPO_ROOT}/runtime/logs/inbox-log.jsonl"
AGENT_MSG_LOCK="${AGENT_MSG_LOG}.lock"

MAX_RETRIES=3
LOCK_TIMEOUT=5
BACKOFF_DELAYS=(0.5 1 2)

MSG_ID="msg_$(date '+%Y%m%d_%H%M%S')_$(head -c 4 /dev/urandom | xxd -p)"
TIMESTAMP=$(date -u "+%Y-%m-%dT%H:%M:%SZ")

log_error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] inbox_write ERROR: $1" >&2
}

mkdir -p "$INBOX_DIR" 2>/dev/null

# Append a JSON record to agent-messages.jsonl for chat display
do_log_agent_message() {
  mkdir -p "$(dirname "$AGENT_MSG_LOG")" 2>/dev/null
  python3 "${SCRIPT_DIR}/lib/inbox_writer.py" log-message \
    "$AGENT_MSG_LOG" "$AGENT_MSG_LOCK" "$MSG_ID" "$TIMESTAMP" "$FROM" "$AGENT" "$MSG_TYPE" "$MSG_CONTENT"
}

do_append() {
  python3 "${SCRIPT_DIR}/lib/inbox_writer.py" append-message \
    "$INBOX_FILE" "$TMP_FILE" "$MSG_ID" "$FROM" "$TIMESTAMP" "$MSG_TYPE" "$MSG_CONTENT"
}

for attempt in $(seq 1 $MAX_RETRIES); do
  (
    if flock -x -w "$LOCK_TIMEOUT" 200 2>/dev/null; then
      do_append
      exit $?
    else
      exit 1
    fi
  ) 200>"$LOCK_FILE"

  exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    do_log_agent_message || true   # non-fatal: chat log failure must not break inbox write
    echo "✅ Message ${MSG_ID} → ${AGENT} inbox"
    exit 0
  elif [[ $exit_code -eq 1 ]]; then
    backoff_idx=$((attempt - 1))
    backoff="${BACKOFF_DELAYS[$backoff_idx]:-2}"
    if [[ $attempt -lt $MAX_RETRIES ]]; then
      log_error "flock timeout on ${INBOX_FILE}, retry ${attempt}/${MAX_RETRIES}, backoff ${backoff}s"
      sleep "$backoff"
    else
      log_error "flock timeout on ${INBOX_FILE} after ${MAX_RETRIES} retries"
      exit 1
    fi
  else
    log_error "YAML error writing to ${INBOX_FILE}"
    exit 2
  fi
done

log_error "flock timeout on ${INBOX_FILE} after ${MAX_RETRIES} retries"
exit 1

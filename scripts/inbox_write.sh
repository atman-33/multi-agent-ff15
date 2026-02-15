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

MAX_RETRIES=3
LOCK_TIMEOUT=5
BACKOFF_DELAYS=(0.5 1 2)

MSG_ID="msg_$(date '+%Y%m%d_%H%M%S')_$(head -c 4 /dev/urandom | xxd -p)"
TIMESTAMP=$(date "+%Y-%m-%dT%H:%M:%S")

log_error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] inbox_write ERROR: $1" >&2
}

mkdir -p "$INBOX_DIR" 2>/dev/null

do_append() {
  python3 - "$INBOX_FILE" "$TMP_FILE" "$MSG_ID" "$FROM" "$TIMESTAMP" "$MSG_TYPE" "$MSG_CONTENT" << 'PYEOF'
import sys
import yaml
import os

inbox_file = sys.argv[1]
tmp_file = sys.argv[2]
msg_id = sys.argv[3]
from_agent = sys.argv[4]
timestamp = sys.argv[5]
msg_type = sys.argv[6]
content = sys.argv[7]

try:
    if os.path.exists(inbox_file):
        with open(inbox_file, 'r') as f:
            data = yaml.safe_load(f) or {}
    else:
        data = {}

    messages = data.get('messages', [])
    if not isinstance(messages, list):
        messages = []

    for m in messages:
        if isinstance(m, dict) and m.get('id') == msg_id:
            sys.exit(0)

    new_msg = {
        'id': msg_id,
        'from': from_agent,
        'timestamp': timestamp,
        'type': msg_type,
        'content': content,
        'read': False
    }
    messages.append(new_msg)

    unread = [m for m in messages if isinstance(m, dict) and not m.get('read', True)]
    read_msgs = [m for m in messages if isinstance(m, dict) and m.get('read', True)]
    read_msgs.sort(key=lambda m: m.get('timestamp', ''), reverse=True)
    pruned_read = read_msgs[:30]
    messages = unread + pruned_read
    messages.sort(key=lambda m: m.get('timestamp', ''))

    data['messages'] = messages

    with open(tmp_file, 'w') as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

    os.rename(tmp_file, inbox_file)
    # Touch file to trigger file watcher events
    os.utime(inbox_file, None)
    sys.exit(0)

except yaml.YAMLError as e:
    print(f"YAML error: {e}", file=sys.stderr)
    if os.path.exists(tmp_file):
        os.remove(tmp_file)
    sys.exit(2)
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    if os.path.exists(tmp_file):
        os.remove(tmp_file)
    sys.exit(2)
PYEOF
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

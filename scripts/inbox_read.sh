#!/usr/bin/env bash
# inbox_read.sh: Read unread messages and mark them as read
#
# Usage:
#   inbox_read.sh <agent>          Read all unread messages (chronological order)
#   inbox_read.sh <agent> --peek   Show unread count only (no mark-as-read)

set -uo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: inbox_read.sh <agent> [--peek]" >&2
  exit 1
fi

AGENT="$1"
PEEK_ONLY="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
INBOX_FILE="${REPO_ROOT}/queue/inbox/${AGENT}.yaml"
LOCK_FILE="${INBOX_FILE}.lock"
LOG_DIR="${REPO_ROOT}/logs"
LOG_FILE="${LOG_DIR}/inbox-read-${AGENT}.log"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Log function
log_message() {
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] inbox_read.sh [${AGENT}]: $1" >> "$LOG_FILE"
}

log_message "[CALLED] peek_only=${PEEK_ONLY}"

if [[ ! -f "$INBOX_FILE" ]]; then
  log_message "[RESULT] No inbox file found, returning 0 unread"
  echo "0 unread messages"
  exit 0
fi

log_message "[PROCESS] Reading inbox file: $INBOX_FILE"

python3 - "$INBOX_FILE" "$LOCK_FILE" "$PEEK_ONLY" "$LOG_FILE" << 'PYEOF'
import sys
import yaml
import os
import fcntl
import time
from datetime import datetime

inbox_file = sys.argv[1]
lock_file = sys.argv[2]
peek_only = sys.argv[3] == "--peek"
log_file = sys.argv[4]

def log(msg):
    timestamp = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    with open(log_file, 'a') as lf:
        lf.write(f"[{timestamp}] inbox_read.py: {msg}\n")

try:
    log(f"[START] peek_only={peek_only}")
    with open(lock_file, 'w') as lf:
        log("[LOCK] Attempting to acquire lock...")
        for attempt in range(3):
            try:
                fcntl.flock(lf, fcntl.LOCK_EX | fcntl.LOCK_NB)
                log(f"[LOCK] Acquired on attempt {attempt + 1}")
                break
            except BlockingIOError:
                log(f"[LOCK] Blocked on attempt {attempt + 1}, waiting...")
                time.sleep([0.5, 1, 2][attempt])
        else:
            log("[LOCK] Waiting for exclusive lock (blocking)...")
            fcntl.flock(lf, fcntl.LOCK_EX)
            log("[LOCK] Acquired (after blocking)")

        with open(inbox_file, 'r') as f:
            data = yaml.safe_load(f) or {}
        log(f"[READ] Loaded inbox data, message count: {len(data.get('messages', []))}")

        messages = data.get('messages', [])
        if not isinstance(messages, list):
            messages = []

        unread = [m for m in messages if isinstance(m, dict) and not m.get('read', True)]
        unread.sort(key=lambda m: m.get('timestamp', ''))
        log(f"[FILTER] Unread count: {len(unread)}")

        if peek_only:
            log("[PEEK] Returning unread count without marking as read")
            print(f"{len(unread)} unread messages")
            sys.exit(0)

        if not unread:
            log("[RESULT] No unread messages")
            print("0 unread messages")
            sys.exit(0)

        log(f"[DISPLAY] Showing {len(unread)} unread messages")

        print(f"{len(unread)} unread message(s):")
        print("---")
        for msg in unread:
            print(f"id: {msg.get('id', '?')}")
            print(f"from: {msg.get('from', '?')}")
            print(f"type: {msg.get('type', '?')}")
            print(f"time: {msg.get('timestamp', '?')}")
            print(f"content: {msg.get('content', '')}")
            print("---")
            msg['read'] = True
        
        log(f"[MARK] Marked {len(unread)} messages as read")

        data['messages'] = messages
        tmp_file = inbox_file + '.tmp'
        with open(tmp_file, 'w') as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
        os.rename(tmp_file, inbox_file)
        log("[WRITE] Updated inbox file with read status")

        fcntl.flock(lf, fcntl.LOCK_UN)
        log("[LOCK] Released lock")

except Exception as e:
    log(f"[ERROR] {e}")
    print(f"Error reading inbox: {e}", file=sys.stderr)
    sys.exit(2)
PYEOF

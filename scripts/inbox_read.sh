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

if [[ ! -f "$INBOX_FILE" ]]; then
  echo "0 unread messages"
  exit 0
fi

python3 - "$INBOX_FILE" "$LOCK_FILE" "$PEEK_ONLY" << 'PYEOF'
import sys
import yaml
import os
import fcntl
import time

inbox_file = sys.argv[1]
lock_file = sys.argv[2]
peek_only = sys.argv[3] == "--peek"

try:
    with open(lock_file, 'w') as lf:
        for attempt in range(3):
            try:
                fcntl.flock(lf, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                time.sleep([0.5, 1, 2][attempt])
        else:
            fcntl.flock(lf, fcntl.LOCK_EX)

        with open(inbox_file, 'r') as f:
            data = yaml.safe_load(f) or {}

        messages = data.get('messages', [])
        if not isinstance(messages, list):
            messages = []

        unread = [m for m in messages if isinstance(m, dict) and not m.get('read', True)]
        unread.sort(key=lambda m: m.get('timestamp', ''))

        if peek_only:
            print(f"{len(unread)} unread messages")
            sys.exit(0)

        if not unread:
            print("0 unread messages")
            sys.exit(0)

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

        data['messages'] = messages
        tmp_file = inbox_file + '.tmp'
        with open(tmp_file, 'w') as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
        os.rename(tmp_file, inbox_file)

        fcntl.flock(lf, fcntl.LOCK_UN)

except Exception as e:
    print(f"Error reading inbox: {e}", file=sys.stderr)
    sys.exit(2)
PYEOF

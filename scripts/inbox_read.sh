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

# Enable logging only if ENABLE_INBOX_READ_LOG is set to "true"
ENABLE_LOG="${ENABLE_INBOX_READ_LOG:-false}"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Log function
log_message() {
  if [[ "$ENABLE_LOG" == "true" ]]; then
    echo "[$(date '+%Y-%m-%dT%H:%M:%S')] inbox_read.sh [${AGENT}]: $1" >> "$LOG_FILE"
  fi
}

log_message "[CALLED] peek_only=${PEEK_ONLY}"

if [[ ! -f "$INBOX_FILE" ]]; then
  log_message "[RESULT] No inbox file found, returning 0 unread"
  echo "0 unread messages"
  exit 0
fi

log_message "[PROCESS] Reading inbox file: $INBOX_FILE"

# Determine mode based on --peek flag
if [[ "$PEEK_ONLY" == "--peek" ]]; then
  READER_MODE="peek"
else
  READER_MODE="read-and-mark"
fi

ENABLE_INBOX_READ_LOG="$ENABLE_LOG" \
INBOX_READ_LOG_FILE="$LOG_FILE" \
  python3 "${SCRIPT_DIR}/lib/inbox_reader.py" "$INBOX_FILE" "$READER_MODE"

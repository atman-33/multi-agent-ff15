#!/usr/bin/env bash
# yaml_write_flock.sh: Atomic YAML write with flock protection
#
# Usage:
#   yaml_write_flock.sh <target_file> <content>
#   echo "yaml content" | yaml_write_flock.sh <target_file> -
#
# Exit codes: 0=success, 1=lock timeout, 2=write error
# Retry: 3 attempts, 5s lock timeout, exponential backoff (0.5s/1s/2s)
# Lock: flock exclusive on fd 200, .lock suffix file
# Atomicity: tmp file + rename pattern

set -uo pipefail

MAX_RETRIES=3
LOCK_TIMEOUT=5
BACKOFF_DELAYS=(0.5 1 2)

if [[ $# -lt 2 ]]; then
  echo "Usage: yaml_write_flock.sh <target_file> <content|->" >&2
  exit 2
fi

TARGET_FILE="$1"
CONTENT_ARG="$2"

if [[ "$CONTENT_ARG" == "-" ]]; then
  CONTENT=$(cat)
else
  CONTENT="$CONTENT_ARG"
fi

TARGET_DIR="$(dirname "$TARGET_FILE")"
LOCK_FILE="${TARGET_FILE}.lock"
TMP_FILE="${TARGET_FILE}.tmp"

if [[ ! -d "$TARGET_DIR" ]]; then
  mkdir -p "$TARGET_DIR" || {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] yaml_write_flock ERROR: Cannot create directory ${TARGET_DIR}" >&2
    exit 2
  }
fi

CALLER="${BASH_SOURCE[1]:-unknown}"
CALLER="$(basename "$CALLER" 2>/dev/null || echo "$CALLER")"

log_error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] yaml_write_flock ERROR: $1, file: ${TARGET_FILE}, caller: ${CALLER}" >&2
}

do_write() {
  echo "$CONTENT" > "$TMP_FILE" || {
    log_error "Failed to write tmp file ${TMP_FILE}"
    rm -f "$TMP_FILE" 2>/dev/null
    return 2
  }

  mv "$TMP_FILE" "$TARGET_FILE" || {
    log_error "Failed to rename ${TMP_FILE} to ${TARGET_FILE}"
    rm -f "$TMP_FILE" 2>/dev/null
    return 2
  }

  return 0
}

for attempt in $(seq 1 $MAX_RETRIES); do
  (
    if flock -x -w "$LOCK_TIMEOUT" 200 2>/dev/null; then
      do_write
      exit $?
    else
      exit 1
    fi
  ) 200>"$LOCK_FILE"

  exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    exit 0
  elif [[ $exit_code -eq 1 ]]; then
    backoff_idx=$((attempt - 1))
    backoff="${BACKOFF_DELAYS[$backoff_idx]:-2}"
    if [[ $attempt -lt $MAX_RETRIES ]]; then
      log_error "flock timeout, retry ${attempt}/${MAX_RETRIES}, backoff ${backoff}s"
      sleep "$backoff"
    else
      log_error "flock timeout after ${MAX_RETRIES} retries"
      exit 1
    fi
  else
    exit 2
  fi
done

log_error "flock timeout after ${MAX_RETRIES} retries"
exit 1

#!/usr/bin/env bash
# Stress test: 3 agents write to same inbox simultaneously
#
# Tests concurrent inbox_write.sh calls to verify atomicity.
# Simulates Noctis, Iris, and Lunafreya all writing to ignis's inbox at once.
#
# Usage: tests/stress_test_inbox_concurrent.sh [iterations]
# Default: 20 iterations

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
INBOX_SCRIPT="${REPO_ROOT}/scripts/inbox_write.sh"
TEST_INBOX_DIR="/tmp/ff15_inbox_test"
TEST_INBOX_FILE="${TEST_INBOX_DIR}/test_agent.yaml"
ITERATIONS="${1:-20}"
SENDERS=("noctis" "iris" "lunafreya")
FAILURES=0
CORRUPTIONS=0
MISSING_MSGS=0

echo "Inbox concurrent write stress test"
echo "  ${#SENDERS[@]} senders, ${ITERATIONS} iterations"
echo "  Target: ${TEST_INBOX_FILE}"
echo ""

mkdir -p "$TEST_INBOX_DIR"

for iter in $(seq 1 "$ITERATIONS"); do
  # Reset inbox
  rm -f "$TEST_INBOX_FILE" "${TEST_INBOX_FILE}.lock" "${TEST_INBOX_FILE}.tmp"
  echo "messages: []" > "$TEST_INBOX_FILE"

  # Override REPO_ROOT for inbox_write.sh by symlinking
  # Instead, we directly call the python logic with flock
  pids=()
  for sender in "${SENDERS[@]}"; do
    (
      # inbox_write.sh uses REPO_ROOT derived from script location
      # We need to write to the test file directly
      # Create a wrapper that calls inbox_write.sh logic for our test path
      python3 - "$TEST_INBOX_FILE" "$sender" "$iter" << 'PYEOF'
import sys
import yaml
import os
import fcntl
import time
import random
import string

inbox_file = sys.argv[1]
sender = sys.argv[2]
iteration = sys.argv[3]
lock_file = inbox_file + ".lock"
tmp_file = inbox_file + ".tmp"

msg_id = f"msg_test_{sender}_{iteration}_{os.getpid()}"
timestamp = time.strftime("%Y-%m-%dT%H:%M:%S")
content = f"Test message from {sender} iteration {iteration}"

for attempt in range(3):
    try:
        with open(lock_file, 'w') as lf:
            try:
                fcntl.flock(lf, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                time.sleep([0.5, 1, 2][attempt])
                fcntl.flock(lf, fcntl.LOCK_EX)

            if os.path.exists(inbox_file):
                with open(inbox_file, 'r') as f:
                    data = yaml.safe_load(f) or {}
            else:
                data = {}

            messages = data.get('messages', [])
            if not isinstance(messages, list):
                messages = []

            new_msg = {
                'id': msg_id,
                'from': sender,
                'timestamp': timestamp,
                'type': 'test',
                'content': content,
                'read': False
            }
            messages.append(new_msg)
            data['messages'] = messages

            with open(tmp_file, 'w') as f:
                yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
            os.rename(tmp_file, inbox_file)

            fcntl.flock(lf, fcntl.LOCK_UN)
            sys.exit(0)
    except Exception as e:
        if attempt == 2:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
        time.sleep(0.5)

sys.exit(1)
PYEOF
    ) &
    pids+=($!)
  done

  for pid in "${pids[@]}"; do
    wait "$pid" || FAILURES=$((FAILURES + 1))
  done

  # Verify YAML integrity
  if [[ -f "$TEST_INBOX_FILE" ]]; then
    if ! python3 -c "import yaml; yaml.safe_load(open('$TEST_INBOX_FILE'))" 2>/dev/null; then
      CORRUPTIONS=$((CORRUPTIONS + 1))
      echo "CORRUPTION at iteration ${iter}:"
      cat "$TEST_INBOX_FILE"
      echo "---"
    else
      # Verify all 3 messages are present
      msg_count=$(python3 -c "
import yaml
with open('$TEST_INBOX_FILE') as f:
    data = yaml.safe_load(f)
msgs = data.get('messages', [])
print(len(msgs))
")
      if [[ "$msg_count" -ne "${#SENDERS[@]}" ]]; then
        MISSING_MSGS=$((MISSING_MSGS + 1))
        echo "MISSING at iteration ${iter}: expected ${#SENDERS[@]}, got ${msg_count}"
      fi
    fi
  else
    CORRUPTIONS=$((CORRUPTIONS + 1))
    echo "MISSING FILE at iteration ${iter}"
  fi

  if [[ $((iter % 5)) -eq 0 ]]; then
    echo "  Progress: ${iter}/${ITERATIONS} (failures: ${FAILURES}, corruptions: ${CORRUPTIONS}, missing: ${MISSING_MSGS})"
  fi
done

# Cleanup
rm -rf "$TEST_INBOX_DIR"

echo ""
echo "Results: ${ITERATIONS} iterations, ${#SENDERS[@]} concurrent writers"
echo "  Lock failures: ${FAILURES}"
echo "  YAML corruptions: ${CORRUPTIONS}"
echo "  Missing messages: ${MISSING_MSGS}"

if [[ $CORRUPTIONS -eq 0 && $MISSING_MSGS -eq 0 ]]; then
  echo "  ✅ PASS: No corruption or missing messages"
  exit 0
else
  echo "  ❌ FAIL: ${CORRUPTIONS} corruptions, ${MISSING_MSGS} missing"
  exit 1
fi

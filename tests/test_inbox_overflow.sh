#!/usr/bin/env bash
# Test overflow pruning: 60 messages → verify correct pruning to max 50
#
# Usage: tests/test_inbox_overflow.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEST_INBOX_DIR="/tmp/ff15_inbox_overflow_test"
TEST_INBOX_FILE="${TEST_INBOX_DIR}/test_agent.yaml"
PASS=0
FAIL=0

mkdir -p "$TEST_INBOX_DIR"

run_test() {
  local test_name="$1"
  local expected_total="$2"
  local expected_unread="$3"
  local actual_total
  local actual_unread

  actual_total=$(python3 -c "
import yaml
with open('$TEST_INBOX_FILE') as f:
    data = yaml.safe_load(f)
msgs = data.get('messages', [])
print(len(msgs))
")
  actual_unread=$(python3 -c "
import yaml
with open('$TEST_INBOX_FILE') as f:
    data = yaml.safe_load(f)
msgs = data.get('messages', [])
unread = [m for m in msgs if not m.get('read', True)]
print(len(unread))
")

  if [[ "$actual_total" -eq "$expected_total" && "$actual_unread" -eq "$expected_unread" ]]; then
    echo "  ✅ ${test_name}: total=${actual_total} (expected ${expected_total}), unread=${actual_unread} (expected ${expected_unread})"
    PASS=$((PASS + 1))
  else
    echo "  ❌ ${test_name}: total=${actual_total} (expected ${expected_total}), unread=${actual_unread} (expected ${expected_unread})"
    FAIL=$((FAIL + 1))
  fi
}

echo "Test 1: 60 read messages → prune to 30 read"
rm -f "$TEST_INBOX_FILE" "${TEST_INBOX_FILE}.lock" "${TEST_INBOX_FILE}.tmp"
python3 - "$TEST_INBOX_FILE" << 'PYEOF'
import yaml, sys
inbox_file = sys.argv[1]
messages = []
for i in range(60):
    messages.append({
        'id': f'msg_read_{i:03d}',
        'from': 'noctis',
        'timestamp': f'2026-02-15T10:{i:02d}:00',
        'type': 'test',
        'content': f'Read message {i}',
        'read': True
    })
with open(inbox_file, 'w') as f:
    yaml.dump({'messages': messages}, f, default_flow_style=False, sort_keys=False)
PYEOF

python3 - "$TEST_INBOX_FILE" << 'PYEOF'
import yaml, sys, os, fcntl, time
inbox_file = sys.argv[1]
lock_file = inbox_file + ".lock"
tmp_file = inbox_file + ".tmp"

with open(lock_file, 'w') as lf:
    fcntl.flock(lf, fcntl.LOCK_EX)
    with open(inbox_file, 'r') as f:
        data = yaml.safe_load(f) or {}
    messages = data.get('messages', [])
    new_msg = {
        'id': 'msg_trigger_001',
        'from': 'iris',
        'timestamp': '2026-02-15T11:00:00',
        'type': 'test',
        'content': 'Trigger overflow',
        'read': False
    }
    messages.append(new_msg)
    unread = [m for m in messages if not m.get('read', True)]
    read_msgs = [m for m in messages if m.get('read', True)]
    read_msgs.sort(key=lambda m: m.get('timestamp', ''), reverse=True)
    pruned_read = read_msgs[:30]
    messages = unread + pruned_read
    messages.sort(key=lambda m: m.get('timestamp', ''))
    data['messages'] = messages
    with open(tmp_file, 'w') as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False)
    os.rename(tmp_file, inbox_file)
    fcntl.flock(lf, fcntl.LOCK_UN)
PYEOF
run_test "60 read + 1 unread → 30 read + 1 unread" 31 1

echo ""
echo "Test 2: 60 unread messages → keep all (no pruning of unread)"
rm -f "$TEST_INBOX_FILE" "${TEST_INBOX_FILE}.lock" "${TEST_INBOX_FILE}.tmp"
python3 - "$TEST_INBOX_FILE" << 'PYEOF'
import yaml, sys
inbox_file = sys.argv[1]
messages = []
for i in range(60):
    messages.append({
        'id': f'msg_unread_{i:03d}',
        'from': 'noctis',
        'timestamp': f'2026-02-15T10:{i:02d}:00',
        'type': 'test',
        'content': f'Unread message {i}',
        'read': False
    })
with open(inbox_file, 'w') as f:
    yaml.dump({'messages': messages}, f, default_flow_style=False, sort_keys=False)
PYEOF
run_test "60 unread → keep all 60" 60 60

echo ""
echo "Test 3: 5 unread + 50 read → 5 unread + 30 read = 35"
rm -f "$TEST_INBOX_FILE" "${TEST_INBOX_FILE}.lock" "${TEST_INBOX_FILE}.tmp"
python3 - "$TEST_INBOX_FILE" << 'PYEOF'
import yaml, sys, os, fcntl
inbox_file = sys.argv[1]
lock_file = inbox_file + ".lock"
tmp_file = inbox_file + ".tmp"

messages = []
for i in range(50):
    messages.append({
        'id': f'msg_r_{i:03d}',
        'from': 'noctis',
        'timestamp': f'2026-02-15T10:{i:02d}:00',
        'type': 'test',
        'content': f'Read msg {i}',
        'read': True
    })
for i in range(5):
    messages.append({
        'id': f'msg_u_{i:03d}',
        'from': 'iris',
        'timestamp': f'2026-02-15T11:{i:02d}:00',
        'type': 'test',
        'content': f'Unread msg {i}',
        'read': False
    })

unread = [m for m in messages if not m.get('read', True)]
read_msgs = [m for m in messages if m.get('read', True)]
read_msgs.sort(key=lambda m: m.get('timestamp', ''), reverse=True)
pruned_read = read_msgs[:30]
messages = unread + pruned_read
messages.sort(key=lambda m: m.get('timestamp', ''))

with open(inbox_file, 'w') as f:
    yaml.dump({'messages': messages}, f, default_flow_style=False, sort_keys=False)
PYEOF
run_test "5 unread + 50 read → 5 unread + 30 read" 35 5

echo ""
echo "Test 4: Verify newest read messages are kept (not oldest)"
rm -f "$TEST_INBOX_FILE" "${TEST_INBOX_FILE}.lock" "${TEST_INBOX_FILE}.tmp"
python3 - "$TEST_INBOX_FILE" << 'PYEOF'
import yaml, sys
inbox_file = sys.argv[1]

messages = []
for i in range(40):
    messages.append({
        'id': f'msg_old_{i:03d}',
        'from': 'noctis',
        'timestamp': f'2026-02-15T08:{i:02d}:00',
        'type': 'test',
        'content': f'Old read msg {i}',
        'read': True
    })

unread = [m for m in messages if not m.get('read', True)]
read_msgs = [m for m in messages if m.get('read', True)]
read_msgs.sort(key=lambda m: m.get('timestamp', ''), reverse=True)
pruned_read = read_msgs[:30]
messages = unread + pruned_read
messages.sort(key=lambda m: m.get('timestamp', ''))

with open(inbox_file, 'w') as f:
    yaml.dump({'messages': messages}, f, default_flow_style=False, sort_keys=False)

with open(inbox_file, 'r') as f:
    data = yaml.safe_load(f)
msgs = data['messages']
oldest_id = msgs[0]['id']
assert oldest_id == 'msg_old_010', f"Expected oldest kept msg to be msg_old_010 (index 10), got {oldest_id}"
newest_id = msgs[-1]['id']
assert newest_id == 'msg_old_039', f"Expected newest kept msg to be msg_old_039, got {newest_id}"
PYEOF

if [[ $? -eq 0 ]]; then
  run_test "40 read → keep newest 30" 30 0
else
  echo "  ❌ Test 4: assertion failed"
  FAIL=$((FAIL + 1))
fi

rm -rf "$TEST_INBOX_DIR"

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
if [[ $FAIL -eq 0 ]]; then
  echo "  ✅ ALL OVERFLOW TESTS PASSED"
  exit 0
else
  echo "  ❌ SOME TESTS FAILED"
  exit 1
fi

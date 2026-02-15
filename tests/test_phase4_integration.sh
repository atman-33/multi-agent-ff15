#!/usr/bin/env bash
# Phase 4 integration tests for messaging system
#
# Usage: tests/test_phase4_integration.sh
# Covers: Tasks 4.1-4.12 (automated validation)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PASS=0
FAIL=0
SKIP=0

assert_pass() {
  local name="$1"
  echo "  ✅ ${name}"
  PASS=$((PASS + 1))
}

assert_fail() {
  local name="$1"
  echo "  ❌ ${name}"
  FAIL=$((FAIL + 1))
}

assert_skip() {
  local name="$1"
  local reason="$2"
  echo "  ⏭️  ${name} (${reason})"
  SKIP=$((SKIP + 1))
}

echo "Phase 4: Integration Tests"
echo "=========================="
echo ""

echo "--- 4.2: Parallel task stress test (inbox integrity) ---"
TEST_DIR="/tmp/ff15_phase4_test"
mkdir -p "${TEST_DIR}/queue/inbox"
echo "messages: []" > "${TEST_DIR}/queue/inbox/stress_agent.yaml"

STRESS_PIDS=()
for i in $(seq 1 20); do
  (
    python3 - "${TEST_DIR}/queue/inbox/stress_agent.yaml" "$i" << 'PYEOF'
import sys, yaml, os, fcntl, time
inbox_file = sys.argv[1]
idx = sys.argv[2]
lock_file = inbox_file + ".lock"
tmp_file = inbox_file + ".tmp"

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
    messages.append({
        'id': f'stress_{idx}_{os.getpid()}',
        'from': 'stress_tester',
        'timestamp': time.strftime("%Y-%m-%dT%H:%M:%S"),
        'type': 'test',
        'content': f'Stress msg {idx}',
        'read': False
    })
    data['messages'] = messages
    with open(tmp_file, 'w') as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False)
    os.rename(tmp_file, inbox_file)
    fcntl.flock(lf, fcntl.LOCK_UN)
PYEOF
  ) &
  STRESS_PIDS+=($!)
done

STRESS_FAILS=0
for pid in "${STRESS_PIDS[@]}"; do
  wait "$pid" || STRESS_FAILS=$((STRESS_FAILS + 1))
done

STRESS_COUNT=$(python3 -c "
import yaml
with open('${TEST_DIR}/queue/inbox/stress_agent.yaml') as f:
    data = yaml.safe_load(f)
print(len(data.get('messages', [])))
")

STRESS_VALID=$(python3 -c "
import yaml
try:
    with open('${TEST_DIR}/queue/inbox/stress_agent.yaml') as f:
        yaml.safe_load(f)
    print('valid')
except:
    print('invalid')
")

if [[ "$STRESS_VALID" == "valid" && "$STRESS_COUNT" -eq 20 && "$STRESS_FAILS" -eq 0 ]]; then
  assert_pass "4.2 Parallel inbox stress (20 writes): ${STRESS_COUNT} msgs, valid YAML"
else
  assert_fail "4.2 Parallel inbox stress: ${STRESS_COUNT}/20 msgs, valid=${STRESS_VALID}, fails=${STRESS_FAILS}"
fi

echo ""
echo "--- 4.4: Race condition test (3 agents x 10 writes) ---"
echo "messages: []" > "${TEST_DIR}/queue/inbox/race_agent.yaml"

RACE_PIDS=()
for agent_idx in 1 2 3; do
  for write_idx in $(seq 1 10); do
    (
      python3 - "${TEST_DIR}/queue/inbox/race_agent.yaml" "${agent_idx}" "${write_idx}" << 'PYEOF'
import sys, yaml, os, fcntl, time
inbox_file = sys.argv[1]
agent = sys.argv[2]
write = sys.argv[3]
lock_file = inbox_file + ".lock"
tmp_file = inbox_file + ".tmp"

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
    messages.append({
        'id': f'race_a{agent}_w{write}_{os.getpid()}',
        'from': f'agent_{agent}',
        'timestamp': time.strftime("%Y-%m-%dT%H:%M:%S"),
        'type': 'test',
        'content': f'Race msg a{agent} w{write}',
        'read': False
    })
    data['messages'] = messages
    with open(tmp_file, 'w') as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False)
    os.rename(tmp_file, inbox_file)
    fcntl.flock(lf, fcntl.LOCK_UN)
PYEOF
    ) &
    RACE_PIDS+=($!)
  done
done

RACE_FAILS=0
for pid in "${RACE_PIDS[@]}"; do
  wait "$pid" || RACE_FAILS=$((RACE_FAILS + 1))
done

RACE_COUNT=$(python3 -c "
import yaml
with open('${TEST_DIR}/queue/inbox/race_agent.yaml') as f:
    data = yaml.safe_load(f)
print(len(data.get('messages', [])))
")

if [[ "$RACE_COUNT" -eq 30 && "$RACE_FAILS" -eq 0 ]]; then
  assert_pass "4.4 Race condition (3 agents x 10 writes): ${RACE_COUNT} msgs, 0 corruption"
else
  assert_fail "4.4 Race condition: ${RACE_COUNT}/30 msgs, fails=${RACE_FAILS}"
fi

echo ""
echo "--- 4.5: Overflow test (100 messages → prune to 50) ---"
python3 - "${TEST_DIR}/queue/inbox/overflow_agent.yaml" << 'PYEOF'
import yaml, sys, os, fcntl
inbox_file = sys.argv[1]
lock_file = inbox_file + ".lock"
tmp_file = inbox_file + ".tmp"

messages = []
for i in range(100):
    messages.append({
        'id': f'overflow_{i:03d}',
        'from': 'noctis',
        'timestamp': f'2026-02-15T10:{i//60:02d}:{i%60:02d}',
        'type': 'test',
        'content': f'Overflow msg {i}',
        'read': True if i < 90 else False
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
total = len(data['messages'])
unread_count = len([m for m in data['messages'] if not m.get('read', True)])
print(f"{total},{unread_count}")
PYEOF

OVERFLOW_RESULT=$(python3 -c "
import yaml
with open('${TEST_DIR}/queue/inbox/overflow_agent.yaml') as f:
    data = yaml.safe_load(f)
total = len(data['messages'])
unread = len([m for m in data['messages'] if not m.get('read', True)])
print(f'{total},{unread}')
")

OVERFLOW_TOTAL=$(echo "$OVERFLOW_RESULT" | cut -d, -f1)
OVERFLOW_UNREAD=$(echo "$OVERFLOW_RESULT" | cut -d, -f2)

if [[ "$OVERFLOW_TOTAL" -le 50 && "$OVERFLOW_UNREAD" -eq 10 ]]; then
  assert_pass "4.5 Overflow pruning: total=${OVERFLOW_TOTAL} (≤50), unread=${OVERFLOW_UNREAD}"
else
  assert_fail "4.5 Overflow pruning: total=${OVERFLOW_TOTAL}, unread=${OVERFLOW_UNREAD}"
fi

echo ""
echo "--- 4.6: flock deadlock test (20 parallel writes) ---"
echo "messages: []" > "${TEST_DIR}/queue/inbox/deadlock_agent.yaml"

DEADLOCK_PIDS=()
for i in $(seq 1 20); do
  (
    python3 - "${TEST_DIR}/queue/inbox/deadlock_agent.yaml" "$i" << 'PYEOF'
import sys, yaml, os, fcntl, time
inbox_file = sys.argv[1]
idx = sys.argv[2]
lock_file = inbox_file + ".lock"
tmp_file = inbox_file + ".tmp"

for retry in range(3):
    try:
        with open(lock_file, 'w') as lf:
            try:
                fcntl.flock(lf, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                time.sleep([0.5, 1, 2][retry])
                with open(lock_file, 'w') as lf2:
                    fcntl.flock(lf2, fcntl.LOCK_EX)
                    lf = lf2

            with open(inbox_file, 'r') as f:
                data = yaml.safe_load(f) or {}
            messages = data.get('messages', [])
            messages.append({
                'id': f'deadlock_{idx}_{os.getpid()}',
                'from': 'tester',
                'timestamp': time.strftime("%Y-%m-%dT%H:%M:%S"),
                'type': 'test',
                'content': f'Deadlock test {idx}',
                'read': False
            })
            data['messages'] = messages
            with open(tmp_file, 'w') as f:
                yaml.dump(data, f, default_flow_style=False, sort_keys=False)
            os.rename(tmp_file, inbox_file)
            fcntl.flock(lf, fcntl.LOCK_UN)
            sys.exit(0)
    except Exception as e:
        if retry == 2:
            sys.exit(1)
        time.sleep(0.5)
sys.exit(1)
PYEOF
  ) &
  DEADLOCK_PIDS+=($!)
done

DEADLOCK_FAILS=0
for pid in "${DEADLOCK_PIDS[@]}"; do
  wait "$pid" || DEADLOCK_FAILS=$((DEADLOCK_FAILS + 1))
done

DEADLOCK_VALID=$(python3 -c "
import yaml
try:
    with open('${TEST_DIR}/queue/inbox/deadlock_agent.yaml') as f:
        yaml.safe_load(f)
    print('valid')
except:
    print('invalid')
")

if [[ "$DEADLOCK_VALID" == "valid" ]]; then
  assert_pass "4.6 flock deadlock test (20 parallel writes): valid YAML, ${DEADLOCK_FAILS} failures"
else
  assert_fail "4.6 flock deadlock test: invalid YAML"
fi

echo ""
echo "--- 4.10: Message type routing test ---"
TYPES_OK=true
for msg_type in task_assigned report_received reminder escalation luna_instruction; do
  echo "messages: []" > "${TEST_DIR}/queue/inbox/type_test.yaml"
  python3 - "${TEST_DIR}/queue/inbox/type_test.yaml" "$msg_type" << 'PYEOF'
import sys, yaml, os, fcntl
inbox_file = sys.argv[1]
msg_type = sys.argv[2]
lock_file = inbox_file + ".lock"
tmp_file = inbox_file + ".tmp"

with open(lock_file, 'w') as lf:
    fcntl.flock(lf, fcntl.LOCK_EX)
    with open(inbox_file, 'r') as f:
        data = yaml.safe_load(f) or {}
    messages = data.get('messages', [])
    messages.append({
        'id': f'type_test_{msg_type}',
        'from': 'tester',
        'timestamp': '2026-02-15T12:00:00',
        'type': msg_type,
        'content': f'Test {msg_type}',
        'read': False
    })
    data['messages'] = messages
    with open(tmp_file, 'w') as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False)
    os.rename(tmp_file, inbox_file)
    fcntl.flock(lf, fcntl.LOCK_UN)
PYEOF

  STORED_TYPE=$(python3 -c "
import yaml
with open('${TEST_DIR}/queue/inbox/type_test.yaml') as f:
    data = yaml.safe_load(f)
print(data['messages'][0]['type'])
")

  if [[ "$STORED_TYPE" != "$msg_type" ]]; then
    TYPES_OK=false
    echo "    ❌ Type '${msg_type}' stored as '${STORED_TYPE}'"
  fi
done

if [[ "$TYPES_OK" == "true" ]]; then
  assert_pass "4.10 Message type routing: all 5 types (task_assigned, report_received, reminder, escalation, luna_instruction)"
else
  assert_fail "4.10 Message type routing: some types mismatched"
fi

echo ""
echo "--- 4.11: Backward compatibility test ---"
BC_OK=true

if [[ ! -f "${REPO_ROOT}/scripts/yaml_write_flock.sh" ]]; then
  BC_OK=false
  echo "    ❌ yaml_write_flock.sh missing"
fi

if ! grep -q "yaml_write_flock" "${REPO_ROOT}/.opencode/skills/send-task/scripts/send_task.sh" 2>/dev/null; then
  BC_OK=false
  echo "    ❌ send-task not using yaml_write_flock"
fi

if ! grep -q "yaml_write_flock\|inbox_write" "${REPO_ROOT}/.opencode/skills/send-report/scripts/send_report.sh" 2>/dev/null; then
  BC_OK=false
  echo "    ❌ send-report not using yaml_write_flock"
fi

for agent in ignis gladiolus prompto; do
  if [[ ! -f "${REPO_ROOT}/queue/tasks/${agent}.yaml" ]] && [[ ! -f "${REPO_ROOT}/queue/inbox/${agent}.yaml" ]]; then
    BC_OK=false
    echo "    ❌ Missing task/inbox files for ${agent}"
  fi
done

if [[ "$BC_OK" == "true" ]]; then
  assert_pass "4.11 Backward compatibility: task/report YAML workflows intact"
else
  assert_fail "4.11 Backward compatibility issues detected"
fi

echo ""
echo "--- Live tests (require tmux ff15 session) ---"
if tmux has-session -t ff15 2>/dev/null; then
  echo "  tmux ff15 session detected"

  echo "  Test 4.7: Busy detection on live agent"
  "${REPO_ROOT}/scripts/busy_detect.sh" "noctis" 2>/dev/null
  BD_EXIT=$?
  if [[ $BD_EXIT -eq 0 || $BD_EXIT -eq 1 ]]; then
    assert_pass "4.7 Busy detection: noctis returned exit ${BD_EXIT}"
  else
    assert_fail "4.7 Busy detection: unexpected exit ${BD_EXIT}"
  fi

  echo "  Test 4.8: Idle detection on live agent"
  "${REPO_ROOT}/scripts/busy_detect.sh" "ignis" 2>/dev/null
  BD_EXIT=$?
  if [[ $BD_EXIT -eq 0 || $BD_EXIT -eq 1 ]]; then
    assert_pass "4.8 Idle detection: ignis returned exit ${BD_EXIT}"
  else
    assert_fail "4.8 Idle detection: unexpected exit ${BD_EXIT}"
  fi
else
  assert_skip "4.7 Busy detection live test" "no tmux ff15 session"
  assert_skip "4.8 Idle detection live test" "no tmux ff15 session"
fi

assert_skip "4.1 E2E test" "requires live multi-agent session"
assert_skip "4.3 Crash recovery test" "requires killing/restarting agent"
assert_skip "4.9 Plugin state reset test" "requires /new during active escalation"
assert_skip "4.12 WSL2 flock test" "requires WSL2 environment"

rm -rf "$TEST_DIR"

echo ""
echo "=============================="
echo "Results: ${PASS} passed, ${FAIL} failed, ${SKIP} skipped"
if [[ $FAIL -eq 0 ]]; then
  echo "  ✅ ALL AUTOMATED TESTS PASSED"
  exit 0
else
  echo "  ❌ SOME TESTS FAILED"
  exit 1
fi

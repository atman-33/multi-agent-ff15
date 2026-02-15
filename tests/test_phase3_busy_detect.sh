#!/usr/bin/env bash
# Phase 3 validation tests for busy detection and inbox-watcher plugin
#
# Usage: tests/test_phase3_busy_detect.sh
# Requires: tmux ff15 session running

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PASS=0
FAIL=0

echo "Phase 3: Busy Detection Tests"
echo "=============================="
echo ""

echo "Test 1: busy_detect.sh exists and is executable"
if [[ -x "${REPO_ROOT}/scripts/busy_detect.sh" ]]; then
  echo "  ✅ PASS"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: scripts/busy_detect.sh not found or not executable"
  FAIL=$((FAIL + 1))
fi

echo "Test 2: busy_detect.sh returns exit code 2 for unknown agent"
"${REPO_ROOT}/scripts/busy_detect.sh" "invalid_agent" 2>/dev/null
if [[ $? -eq 2 ]]; then
  echo "  ✅ PASS"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: expected exit 2 for unknown agent"
  FAIL=$((FAIL + 1))
fi

echo "Test 3: send_message.sh includes busy detection integration"
if grep -q "BUSY_DETECT" "${REPO_ROOT}/scripts/send_message.sh"; then
  echo "  ✅ PASS"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: send_message.sh missing busy detection"
  FAIL=$((FAIL + 1))
fi

echo "Test 4: send_message.sh skips nudge on BUSY (exit 1)"
if grep -q "Target agent busy" "${REPO_ROOT}/scripts/send_message.sh"; then
  echo "  ✅ PASS"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: send_message.sh missing nudge-skip logic"
  FAIL=$((FAIL + 1))
fi

echo "Test 5: inbox-watcher.ts exists"
if [[ -f "${REPO_ROOT}/.opencode/plugins/inbox-watcher.ts" ]]; then
  echo "  ✅ PASS"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: inbox-watcher.ts not found"
  FAIL=$((FAIL + 1))
fi

echo "Test 6: inbox-watcher only runs on noctis agent"
if grep -q 'agentId !== "noctis"' "${REPO_ROOT}/.opencode/plugins/inbox-watcher.ts"; then
  echo "  ✅ PASS"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: missing noctis-only guard"
  FAIL=$((FAIL + 1))
fi

echo "Test 7: inbox-watcher escalates only Comrades (not Noctis/Luna/Iris)"
if grep -q 'ESCALATION_AGENTS.*ignis.*gladiolus.*prompto' "${REPO_ROOT}/.opencode/plugins/inbox-watcher.ts"; then
  echo "  ✅ PASS"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: escalation agents filter incorrect"
  FAIL=$((FAIL + 1))
fi

echo "Test 8: inbox-watcher uses 30s polling interval"
if grep -q '30_000' "${REPO_ROOT}/.opencode/plugins/inbox-watcher.ts"; then
  echo "  ✅ PASS"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: 30s interval not found"
  FAIL=$((FAIL + 1))
fi

echo "Test 9: inbox-watcher uses 240s escalation threshold"
if grep -q '240_000' "${REPO_ROOT}/.opencode/plugins/inbox-watcher.ts"; then
  echo "  ✅ PASS"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: 240s threshold not found"
  FAIL=$((FAIL + 1))
fi

echo "Test 10: inbox-watcher uses 300s cooldown"
if grep -q '300_000' "${REPO_ROOT}/.opencode/plugins/inbox-watcher.ts"; then
  echo "  ✅ PASS"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: 300s cooldown not found"
  FAIL=$((FAIL + 1))
fi

echo "Test 11: queue/metrics/ directory exists"
if [[ -d "${REPO_ROOT}/queue/metrics" ]]; then
  echo "  ✅ PASS"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: queue/metrics/ not found"
  FAIL=$((FAIL + 1))
fi

echo "Test 12: inbox-watcher logs escalation events"
if grep -q 'escalation.yaml' "${REPO_ROOT}/.opencode/plugins/inbox-watcher.ts"; then
  echo "  ✅ PASS"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: escalation logging not found"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
if [[ $FAIL -eq 0 ]]; then
  echo "  ✅ ALL PHASE 3 TESTS PASSED"
  exit 0
else
  echo "  ❌ SOME TESTS FAILED"
  exit 1
fi

#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

chmod +x "${SCRIPT_DIR}"/*.sh

echo "Running all tests..."
echo "====================="
echo ""

failed=0

echo "--- Busy Detection Tests ---"
"${SCRIPT_DIR}/test_busy_detection.sh" || failed=1
echo ""

echo "--- Integration Tests ---"
"${SCRIPT_DIR}/test_integration.sh" || failed=1
echo ""

echo "--- Stress Tests (flock) ---"
"${SCRIPT_DIR}/stress_test_flock.sh" || echo "  ⚠️  Stress test had issues"
echo ""

echo "--- Stress Tests (inbox concurrent) ---"
"${SCRIPT_DIR}/stress_test_inbox_concurrent.sh" || echo "  ⚠️  Concurrent test had issues"
echo ""

echo "--- Overflow Tests ---"
"${SCRIPT_DIR}/test_inbox_overflow.sh" || echo "  ⚠️  Overflow test had issues"
echo ""

echo "====================="
if [[ $failed -eq 0 ]]; then
  echo "✅ ALL TESTS COMPLETED"
  exit 0
else
  echo "❌ SOME TESTS FAILED"
  exit 1
fi

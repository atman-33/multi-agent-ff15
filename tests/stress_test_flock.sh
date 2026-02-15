#!/usr/bin/env bash
# Stress test: 10 parallel processes write same YAML simultaneously
#
# Usage: tests/stress_test_flock.sh [iterations]
# Default: 100 iterations

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FLOCK_SCRIPT="${REPO_ROOT}/scripts/yaml_write_flock.sh"
TEST_FILE="/tmp/ff15_stress_test.yaml"
ITERATIONS="${1:-100}"
PARALLEL=10
FAILURES=0
CORRUPTIONS=0

echo "Stress test: ${PARALLEL} parallel writers, ${ITERATIONS} iterations"
echo "Target: ${TEST_FILE}"
echo ""

for iter in $(seq 1 "$ITERATIONS"); do
  rm -f "$TEST_FILE" "${TEST_FILE}.lock" "${TEST_FILE}.tmp"

  pids=()
  for p in $(seq 1 "$PARALLEL"); do
    (
      "$FLOCK_SCRIPT" "$TEST_FILE" "writer: ${p}
iteration: ${iter}
timestamp: $(date '+%Y-%m-%dT%H:%M:%S')" 2>/dev/null
    ) &
    pids+=($!)
  done

  for pid in "${pids[@]}"; do
    wait "$pid" || FAILURES=$((FAILURES + 1))
  done

  if [[ -f "$TEST_FILE" ]]; then
    if ! python3 -c "import yaml; yaml.safe_load(open('$TEST_FILE'))" 2>/dev/null; then
      CORRUPTIONS=$((CORRUPTIONS + 1))
      echo "CORRUPTION at iteration ${iter}:"
      cat "$TEST_FILE"
      echo "---"
    fi
  else
    CORRUPTIONS=$((CORRUPTIONS + 1))
    echo "MISSING FILE at iteration ${iter}"
  fi

  if [[ $((iter % 10)) -eq 0 ]]; then
    echo "  Progress: ${iter}/${ITERATIONS} (failures: ${FAILURES}, corruptions: ${CORRUPTIONS})"
  fi
done

rm -f "$TEST_FILE" "${TEST_FILE}.lock" "${TEST_FILE}.tmp"

echo ""
echo "Results: ${ITERATIONS} iterations, ${PARALLEL} parallel writers"
echo "  Lock failures: ${FAILURES}"
echo "  YAML corruptions: ${CORRUPTIONS}"

if [[ $CORRUPTIONS -eq 0 ]]; then
  echo "  ✅ PASS: No YAML corruption detected"
  exit 0
else
  echo "  ❌ FAIL: ${CORRUPTIONS} corruptions detected"
  exit 1
fi

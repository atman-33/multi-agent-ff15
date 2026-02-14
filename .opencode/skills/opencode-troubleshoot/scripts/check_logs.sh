#!/bin/bash
# Check OpenCode logs
# Usage: ./check_logs.sh [number_of_files]

set -euo pipefail

# Determine platform and log directory
if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux-gnu"* ]]; then
    LOG_DIR="$HOME/.local/share/opencode/log"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    LOG_DIR="$USERPROFILE/.local/share/opencode/log"
else
    LOG_DIR="$HOME/.local/share/opencode/log"
fi

# Default: show 1 most recent log file
NUM_FILES="${1:-1}"

echo "=== OpenCode Log Files ==="
echo "Location: $LOG_DIR"
echo ""

if [[ ! -d "$LOG_DIR" ]]; then
    echo "❌ Log directory not found: $LOG_DIR"
    exit 1
fi

# List most recent log files
echo "📄 Most recent $NUM_FILES log file(s):"
ls -lt "$LOG_DIR"/*.log 2>/dev/null | head -n "$NUM_FILES" | awk '{print $9}'

echo ""
echo "=== Latest Log Content ==="
LATEST_LOG=$(ls -t "$LOG_DIR"/*.log 2>/dev/null | head -n 1)

if [[ -f "$LATEST_LOG" ]]; then
    echo "File: $LATEST_LOG"
    echo ""
    tail -n 50 "$LATEST_LOG"
else
    echo "❌ No log files found"
    exit 1
fi

#!/bin/bash
# Check OpenCode storage directory
# Usage: ./check_storage.sh

set -euo pipefail

# Determine platform and storage directory
if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux-gnu"* ]]; then
    STORAGE_DIR="$HOME/.local/share/opencode"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    STORAGE_DIR="$USERPROFILE/.local/share/opencode"
else
    STORAGE_DIR="$HOME/.local/share/opencode"
fi

echo "=== OpenCode Storage ==="
echo "Location: $STORAGE_DIR"
echo ""

if [[ ! -d "$STORAGE_DIR" ]]; then
    echo "❌ Storage directory not found: $STORAGE_DIR"
    exit 1
fi

echo "📁 Storage structure:"
echo ""

# Show directory structure with sizes
du -sh "$STORAGE_DIR"/* 2>/dev/null || echo "No files found"

echo ""
echo "=== Key Files ==="

# Check auth.json
if [[ -f "$STORAGE_DIR/auth.json" ]]; then
    echo "✅ auth.json exists (authentication data)"
else
    echo "❌ auth.json not found (authentication may be needed)"
fi

# Check log directory
if [[ -d "$STORAGE_DIR/log" ]]; then
    LOG_COUNT=$(ls -1 "$STORAGE_DIR/log"/*.log 2>/dev/null | wc -l)
    echo "✅ log/ directory exists ($LOG_COUNT log files)"
else
    echo "❌ log/ directory not found"
fi

# Check project directory
if [[ -d "$STORAGE_DIR/project" ]]; then
    echo "✅ project/ directory exists (session data stored here)"
else
    echo "⚠️  project/ directory not found (may be normal if no sessions yet)"
fi

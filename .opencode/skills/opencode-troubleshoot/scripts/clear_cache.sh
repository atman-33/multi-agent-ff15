#!/bin/bash
# Clear OpenCode cache
# Usage: ./clear_cache.sh

set -euo pipefail

# Determine platform and cache directory
if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux-gnu"* ]]; then
    CACHE_DIR="$HOME/.cache/opencode"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    CACHE_DIR="$USERPROFILE/.cache/opencode"
else
    CACHE_DIR="$HOME/.cache/opencode"
fi

echo "=== OpenCode Cache Clear ==="
echo "Cache location: $CACHE_DIR"
echo ""

if [[ ! -d "$CACHE_DIR" ]]; then
    echo "✅ Cache directory does not exist (already clean)"
    exit 0
fi

# Confirm before deletion
read -p "Delete cache directory? This will force OpenCode to rebuild. (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️  Deleting cache..."
    rm -rf "$CACHE_DIR"
    echo "✅ Cache cleared successfully"
    echo ""
    echo "Next steps:"
    echo "1. Restart OpenCode Desktop (if using desktop app)"
    echo "2. OpenCode will reinstall provider packages automatically"
else
    echo "❌ Cancelled"
    exit 0
fi

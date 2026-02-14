#!/usr/bin/env bash
# typescript-check: TypeScript error checker for OpenCode plugins
#
# Usage:
#   check.sh <file.ts>
#
# Examples:
#   check.sh .opencode/plugins/yaml-write-validator.ts
#   check.sh .opencode/plugins/my-plugin.ts

set -euo pipefail

# --- Argument validation ---
if [[ $# -lt 1 ]]; then
  echo "Usage: check.sh <file.ts>" >&2
  echo "  Run TypeScript check on a single file" >&2
  exit 1
fi

FILE_PATH="$1"

# --- Validate file exists ---
if [[ ! -f "$FILE_PATH" ]]; then
  echo "❌ Error: File not found: $FILE_PATH" >&2
  exit 1
fi

# --- Resolve repository root ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"

# --- Check if tsc is available ---
if ! command -v npx &> /dev/null; then
  echo "❌ Error: npx not found. Is Node.js installed?" >&2
  exit 1
fi

# --- Run TypeScript check ---
echo "🔍 Checking TypeScript errors in: $FILE_PATH"
echo ""

# Change to repo root so tsc can resolve modules
pushd "$REPO_ROOT" > /dev/null

# Run tsc with OpenCode plugin-optimized flags
if npx tsc --noEmit \
  --skipLibCheck \
  --moduleResolution node16 \
  --module node16 \
  --lib es2015,dom \
  --target esnext \
  --types node \
  "$FILE_PATH" 2>&1; then
  
  echo ""
  echo "✅ No TypeScript errors found"
  echo "   File: $FILE_PATH"
  exit 0
else
  echo ""
  echo "❌ TypeScript errors found (see above)"
  echo "   File: $FILE_PATH"
  echo ""
  echo "💡 Tip: Check docs/typescript-error-check.md for common error patterns"
  exit 1
fi

popd > /dev/null

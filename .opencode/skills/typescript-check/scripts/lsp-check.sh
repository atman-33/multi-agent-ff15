#!/usr/bin/env bash
# lsp-check: LSP diagnostics wrapper for TypeScript files
#
# Usage:
#   lsp-check.sh <file.ts>
#
# Examples:
#   lsp-check.sh .opencode/plugins/iris-dashboard-analyzer.ts
#   lsp-check.sh .opencode/plugins/my-plugin.ts
#
# Note: This script outputs diagnostic information but cannot directly
# invoke LSP tools. Use within OpenCode where lsp_diagnostics is available.

set -euo pipefail

# --- Argument validation ---
if [[ $# -lt 1 ]]; then
  echo "Usage: lsp-check.sh <file.ts>" >&2
  echo "  Check TypeScript file using LSP diagnostics" >&2
  echo "" >&2
  echo "Note: Run within OpenCode session where lsp_diagnostics tool is available" >&2
  exit 1
fi

FILE_PATH="$1"

# --- Validate file exists ---
if [[ ! -f "$FILE_PATH" ]]; then
  echo "❌ Error: File not found: $FILE_PATH" >&2
  exit 1
fi

# --- Output instructions ---
echo "🔍 LSP Diagnostics Check for: $FILE_PATH"
echo ""
echo "To check this file with LSP diagnostics, run within OpenCode:"
echo ""
echo "  lsp_diagnostics filePath=\"$FILE_PATH\""
echo ""
echo "Or use the TypeScript compiler check (faster, no OpenCode required):"
echo ""
echo "  .opencode/skills/typescript-check/scripts/check.sh \"$FILE_PATH\""
echo ""
echo "💡 For detailed error patterns, see: docs/typescript-error-check.md"

# --- Run tsc check as fallback ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/check.sh" "$FILE_PATH" 2>&1 || true

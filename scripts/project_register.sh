#!/usr/bin/env bash
# project_register.sh: Register external projects with instruction file detection
#
# Usage:
#   project_register.sh --id <id> --name <name> --root <path> [--force]
#
# Detects instruction files (AGENTS.md, CLAUDE.md, GEMINI.md) at project root.
# Stores metadata in projects/<id>.yaml including existence, path, and SHA256 hash.
#
# Exit codes: 0=success, 1=error, 2=usage error

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECTS_DIR="${REPO_ROOT}/projects"
YAML_WRITE="${SCRIPT_DIR}/yaml_write_flock.sh"

# Instruction file types to detect (root only)
INSTRUCTION_FILES=("AGENTS.md" "CLAUDE.md" "GEMINI.md")

# Defaults
PROJECT_ID=""
PROJECT_NAME=""
PROJECT_ROOT=""
FORCE=false

# --- Argument parsing ---
usage() {
  cat >&2 <<EOF
Usage: project_register.sh --id <id> --name <name> --root <path> [--force]

Options:
  --id      Unique project identifier (required)
  --name    Human-readable project name (required)
  --root    Absolute or relative path to project root (required)
  --force   Overwrite existing registration without prompting
EOF
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --id)
      PROJECT_ID="$2"
      shift 2
      ;;
    --name)
      PROJECT_NAME="$2"
      shift 2
      ;;
    --root)
      PROJECT_ROOT="$2"
      shift 2
      ;;
    --force)
      FORCE=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "ERROR: Unknown argument: $1" >&2
      usage
      ;;
  esac
done

# Validate required arguments
if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: --id is required" >&2
  usage
fi
if [[ -z "$PROJECT_NAME" ]]; then
  echo "ERROR: --name is required" >&2
  usage
fi
if [[ -z "$PROJECT_ROOT" ]]; then
  echo "ERROR: --root is required" >&2
  usage
fi

# --- Path normalization (Task 2.5) ---
# Check if path contains symlinks before resolving
if [[ -L "$PROJECT_ROOT" ]]; then
  echo "ERROR: Project root path is a symlink. Symlinks are rejected by default for security." >&2
  echo "  Path: $PROJECT_ROOT" >&2
  exit 1
fi

# Normalize with realpath
if ! NORMALIZED_ROOT="$(realpath "$PROJECT_ROOT" 2>/dev/null)"; then
  echo "ERROR: Cannot resolve path: $PROJECT_ROOT" >&2
  exit 1
fi

# --- Symlink policy check (Task 2.6) ---
# After realpath resolution, verify the resolved path exists and is a directory
if [[ ! -d "$NORMALIZED_ROOT" ]]; then
  echo "ERROR: Project root is not a directory: $NORMALIZED_ROOT" >&2
  exit 1
fi

# Check for symlinks in the resolved path components
CURRENT_PATH="$NORMALIZED_ROOT"
while [[ "$CURRENT_PATH" != "/" ]]; do
  if [[ -L "$CURRENT_PATH" ]]; then
    echo "ERROR: Symlink detected in path component: $CURRENT_PATH" >&2
    echo "  Symlinks are rejected by default policy." >&2
    exit 1
  fi
  CURRENT_PATH="$(dirname "$CURRENT_PATH")"
done

# --- Re-registration handling (Task 2.7) ---
OUTPUT_FILE="${PROJECTS_DIR}/${PROJECT_ID}.yaml"
if [[ -f "$OUTPUT_FILE" ]]; then
  if [[ "$FORCE" == true ]]; then
    echo "INFO: Re-registering project '${PROJECT_ID}' (--force)" >&2
  else
    echo "WARNING: Project '${PROJECT_ID}' already registered at ${OUTPUT_FILE}" >&2
    read -r -p "Overwrite? [y/N] " response
    case "$response" in
      [yY]|[yY][eE][sS])
        echo "INFO: Overwriting project '${PROJECT_ID}'" >&2
        ;;
      *)
        echo "Aborted." >&2
        exit 1
        ;;
    esac
  fi
fi

# --- Instruction file detection (Task 2.2) ---
TIMESTAMP=$(date -u "+%Y-%m-%dT%H:%M:%SZ")
INSTRUCTION_ENTRIES=""
FILES_FOUND=0

for FILENAME in "${INSTRUCTION_FILES[@]}"; do
  FILEPATH="${NORMALIZED_ROOT}/${FILENAME}"
  
  # Determine type from filename
  case "$FILENAME" in
    AGENTS.md)  FILE_TYPE="agents" ;;
    CLAUDE.md)  FILE_TYPE="claude" ;;
    GEMINI.md)  FILE_TYPE="gemini" ;;
    *)          FILE_TYPE="unknown" ;;
  esac

  if [[ -f "$FILEPATH" && ! -L "$FILEPATH" ]]; then
    # File exists and is not a symlink — compute SHA256 (Task 2.3)
    SHA256=$(sha256sum "$FILEPATH" | awk '{print $1}')
    INSTRUCTION_ENTRIES+="  - type: ${FILE_TYPE}
    path: \"${FILEPATH}\"
    exists: true
    sha256: \"${SHA256}\"
    last_checked_at: \"${TIMESTAMP}\"
"
    FILES_FOUND=$((FILES_FOUND + 1))
  else
    # File does not exist or is a symlink
    INSTRUCTION_ENTRIES+="  - type: ${FILE_TYPE}
    path: \"${FILEPATH}\"
    exists: false
    sha256: \"\"
    last_checked_at: \"${TIMESTAMP}\"
"
  fi
done

# --- Warning for no instruction files (Task 2.8) ---
if [[ "$FILES_FOUND" -eq 0 ]]; then
  echo "WARNING: No instruction files found at project root: ${NORMALIZED_ROOT}" >&2
  echo "  Searched for: ${INSTRUCTION_FILES[*]}" >&2
fi

# --- YAML output generation (Task 2.4) ---
mkdir -p "$PROJECTS_DIR" 2>/dev/null

YAML_CONTENT="id: \"${PROJECT_ID}\"
name: \"${PROJECT_NAME}\"
root_path: \"${NORMALIZED_ROOT}\"
instruction_files:
${INSTRUCTION_ENTRIES}updated_at: \"${TIMESTAMP}\""

# Write using yaml_write_flock.sh for atomic writes
if ! "$YAML_WRITE" "$OUTPUT_FILE" "$YAML_CONTENT"; then
  echo "ERROR: Failed to write project definition to ${OUTPUT_FILE}" >&2
  exit 1
fi

echo "OK: Project '${PROJECT_ID}' registered successfully" >&2
echo "  Name: ${PROJECT_NAME}" >&2
echo "  Root: ${NORMALIZED_ROOT}" >&2
echo "  Instruction files found: ${FILES_FOUND}/${#INSTRUCTION_FILES[@]}" >&2
echo "  Output: ${OUTPUT_FILE}" >&2

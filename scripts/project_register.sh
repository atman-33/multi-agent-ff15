#!/usr/bin/env bash
# project_register.sh: Register external projects with instruction file detection
#
# Usage:
#   project_register.sh --id <id> --name <name> --root <path> [--serena-project <value>] [--force]
#
# Detects instruction files (AGENTS.md, CLAUDE.md, GEMINI.md) at project root.
# Stores metadata in projects/<id>/project.yaml with existing instruction file paths.
# If --serena-project is provided, stores it in serena_project field for Serena MCP activation.
#
# Exit codes: 0=success, 1=error, 2=usage error

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECTS_DIR="${REPO_ROOT}/projects"
YAML_WRITE="${SCRIPT_DIR}/yaml_write_flock.sh"

INSTRUCTION_FILES=("AGENTS.md" "CLAUDE.md" "GEMINI.md")

# Defaults
PROJECT_ID=""
PROJECT_NAME=""
PROJECT_ROOT=""
SERENA_PROJECT=""
FORCE=false

yaml_quote() {
  local value="$1"
  value=${value//\'/\'\'}
  printf "'%s'" "$value"
}

# --- Argument parsing ---
usage() {
  cat >&2 <<EOF
Usage: project_register.sh --id <id> --name <name> --root <path> [--serena-project <value>] [--force]

Options:
  --id               Unique project identifier (required)
  --name             Human-readable project name (required)
  --root             Absolute or relative path to project root (required)
  --serena-project   Value confirmed by activate_project (project name or path).
                     When provided, stored as serena_project in the YAML.
                     When omitted, serena_project field is not written.
  --force            Overwrite existing registration without prompting
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
    --serena-project)
      if [[ -z "${2:-}" ]]; then
        echo "ERROR: --serena-project requires a non-empty value" >&2
        exit 2
      fi
      SERENA_PROJECT="$2"
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
OUTPUT_DIR="${PROJECTS_DIR}/${PROJECT_ID}"
OUTPUT_FILE="${OUTPUT_DIR}/project.yaml"
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

EXISTING_SERENA_PROJECT_LINE=""
if [[ -z "$SERENA_PROJECT" && -f "$OUTPUT_FILE" ]]; then
  EXISTING_SERENA_PROJECT_LINE="$(grep -m1 '^serena_project:' "$OUTPUT_FILE" || true)"
fi

# --- Instruction file detection (Task 2.2) ---
INSTRUCTION_ENTRIES=""
FILES_FOUND=0

for FILENAME in "${INSTRUCTION_FILES[@]}"; do
  FILEPATH="${NORMALIZED_ROOT}/${FILENAME}"

  if [[ -f "$FILEPATH" && ! -L "$FILEPATH" ]]; then
    INSTRUCTION_ENTRIES+="  - path: $(yaml_quote "$FILEPATH")
    enabled: true
"
    FILES_FOUND=$((FILES_FOUND + 1))
  fi
done

# --- Warning for no instruction files (Task 2.8) ---
if [[ "$FILES_FOUND" -eq 0 ]]; then
  echo "WARNING: No instruction files found at project root: ${NORMALIZED_ROOT}" >&2
  echo "  Searched for: ${INSTRUCTION_FILES[*]}" >&2
fi

# --- YAML output generation (Task 2.4) ---
mkdir -p "$OUTPUT_DIR" 2>/dev/null

# Build serena_project line only if value was provided
SERENA_PROJECT_LINE=""
if [[ -n "$SERENA_PROJECT" ]]; then
  SERENA_PROJECT_LINE="serena_project: $(yaml_quote "$SERENA_PROJECT")
"
elif [[ -n "$EXISTING_SERENA_PROJECT_LINE" ]]; then
  SERENA_PROJECT_LINE="${EXISTING_SERENA_PROJECT_LINE}
"
fi

INSTRUCTION_FILES_BLOCK="instruction_files: []"
if [[ -n "$INSTRUCTION_ENTRIES" ]]; then
  INSTRUCTION_FILES_BLOCK="instruction_files:
${INSTRUCTION_ENTRIES}"
fi

YAML_CONTENT="id: $(yaml_quote "$PROJECT_ID")
name: $(yaml_quote "$PROJECT_NAME")
root_path: $(yaml_quote "$NORMALIZED_ROOT")
${SERENA_PROJECT_LINE}${INSTRUCTION_FILES_BLOCK}"

# Write using yaml_write_flock.sh for atomic writes
if ! "$YAML_WRITE" "$OUTPUT_FILE" "$YAML_CONTENT"; then
  echo "ERROR: Failed to write project definition to ${OUTPUT_FILE}" >&2
  exit 1
fi

echo "OK: Project '${PROJECT_ID}' registered successfully" >&2
echo "  Name: ${PROJECT_NAME}" >&2
echo "  Root: ${NORMALIZED_ROOT}" >&2
if [[ -n "$SERENA_PROJECT" ]]; then
  echo "  Serena: ${SERENA_PROJECT}" >&2
else
  echo "  Serena: (not set — run activate_project first, then re-register with --serena-project)" >&2
fi
echo "  Instruction files found: ${FILES_FOUND}/${#INSTRUCTION_FILES[@]}" >&2
echo "  Output: ${OUTPUT_FILE}" >&2

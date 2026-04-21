#!/usr/bin/env bash
# project_delete.sh: Delete registered project entries from the FF15 registry.
#
# Usage:
#   project_delete.sh --id <id> [--force]

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECTS_DIR="${REPO_ROOT}/projects"
PROJECTS_REAL="$(realpath -m "${PROJECTS_DIR}")"

PROJECT_ID=""
FORCE=false

usage() {
  cat >&2 <<EOF
Usage: project_delete.sh --id <id> [--force]

Options:
  --id       Registered project identifier to remove (required)
  --force    Skip the confirmation prompt
EOF
  exit 2
}

resolve_registry_dir() {
  local project_id="$1"
  local candidate

  candidate="$(realpath -m "${PROJECTS_DIR}/${project_id}")"
  case "$candidate" in
    "${PROJECTS_REAL}"/*)
      printf '%s\n' "$candidate"
      ;;
    *)
      echo "ERROR: Invalid project id: ${project_id}" >&2
      exit 1
      ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --id)
      PROJECT_ID="${2:-}"
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

if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: --id is required" >&2
  usage
fi

OUTPUT_DIR="$(resolve_registry_dir "$PROJECT_ID")"
OUTPUT_FILE="${OUTPUT_DIR}/project.yaml"

if [[ ! -f "$OUTPUT_FILE" ]]; then
  echo "ERROR: Project '${PROJECT_ID}' is not registered" >&2
  exit 1
fi

if [[ "$FORCE" != true ]]; then
  echo "WARNING: This removes only the registry entry. The working tree is left untouched." >&2
  read -r -p "Delete registry entry '${PROJECT_ID}'? [y/N] " response
  case "$response" in
    [yY]|[yY][eE][sS])
      ;;
    *)
      echo "Aborted." >&2
      exit 1
      ;;
  esac
fi

rm -rf "$OUTPUT_DIR"

echo "OK: Project '${PROJECT_ID}' deleted from registry" >&2
echo "  Removed: ${OUTPUT_DIR}" >&2
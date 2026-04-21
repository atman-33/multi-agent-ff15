#!/usr/bin/env bash
# project_rename.sh: Rename or re-key registered projects while preserving registry metadata.
#
# Usage:
#   project_rename.sh --id <current_id> [--new-id <new_id>] [--name <new_name>] [--force]

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECTS_DIR="${REPO_ROOT}/projects"
PROJECTS_REAL="$(realpath -m "${PROJECTS_DIR}")"
REGISTER_SCRIPT="${SCRIPT_DIR}/project_register.sh"

PROJECT_ID=""
NEW_PROJECT_ID=""
NEW_PROJECT_NAME=""
FORCE=false

usage() {
  cat >&2 <<EOF
Usage: project_rename.sh --id <current_id> [--new-id <new_id>] [--name <new_name>] [--force]

Options:
  --id       Current registered project identifier (required)
  --new-id   New project identifier when re-keying the registry entry
  --name     New human-readable project name
  --force    Skip overwrite prompts during re-registration
EOF
  exit 2
}

trim_whitespace() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

decode_yaml_scalar() {
  local value
  value="$(trim_whitespace "$1")"

  if [[ ${#value} -ge 2 && "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
    value="${value:1:${#value}-2}"
    value="${value//\'\'/\'}"
  elif [[ ${#value} -ge 2 && "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf '%s' "$value"
}

extract_yaml_scalar() {
  local file="$1"
  local key="$2"
  local line

  line="$(grep -m1 "^${key}:" "$file" || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi

  decode_yaml_scalar "${line#${key}:}"
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
    --new-id)
      NEW_PROJECT_ID="${2:-}"
      shift 2
      ;;
    --name)
      NEW_PROJECT_NAME="${2:-}"
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

if [[ -z "$NEW_PROJECT_ID" && -z "$NEW_PROJECT_NAME" ]]; then
  echo "ERROR: Provide --new-id, --name, or both" >&2
  usage
fi

CURRENT_OUTPUT_DIR="$(resolve_registry_dir "$PROJECT_ID")"
CURRENT_OUTPUT_FILE="${CURRENT_OUTPUT_DIR}/project.yaml"

if [[ ! -f "$CURRENT_OUTPUT_FILE" ]]; then
  echo "ERROR: Project '${PROJECT_ID}' is not registered" >&2
  exit 1
fi

CURRENT_NAME="$(extract_yaml_scalar "$CURRENT_OUTPUT_FILE" "name")"
CURRENT_ROOT_REL="$(extract_yaml_scalar "$CURRENT_OUTPUT_FILE" "root_path")"
CURRENT_SERENA_PROJECT="$(extract_yaml_scalar "$CURRENT_OUTPUT_FILE" "serena_project" || true)"

if ! CURRENT_ROOT="$(realpath "${CURRENT_OUTPUT_DIR}/${CURRENT_ROOT_REL}" 2>/dev/null)"; then
  echo "ERROR: Cannot resolve root_path from ${CURRENT_OUTPUT_FILE}" >&2
  exit 1
fi

TARGET_PROJECT_ID="${NEW_PROJECT_ID:-$PROJECT_ID}"
TARGET_PROJECT_NAME="${NEW_PROJECT_NAME:-$CURRENT_NAME}"

if [[ "$TARGET_PROJECT_ID" == "$PROJECT_ID" && "$TARGET_PROJECT_NAME" == "$CURRENT_NAME" ]]; then
  echo "ERROR: No changes requested" >&2
  exit 1
fi

REGISTER_ARGS=(
  --id "$TARGET_PROJECT_ID"
  --name "$TARGET_PROJECT_NAME"
  --root "$CURRENT_ROOT"
)

if [[ -n "$CURRENT_SERENA_PROJECT" ]]; then
  REGISTER_ARGS+=(--serena-project "$CURRENT_SERENA_PROJECT")
fi

if [[ "$FORCE" == true ]]; then
  REGISTER_ARGS+=(--force)
fi

"$REGISTER_SCRIPT" "${REGISTER_ARGS[@]}"

if [[ "$TARGET_PROJECT_ID" != "$PROJECT_ID" ]]; then
  rm -rf "$CURRENT_OUTPUT_DIR"
  echo "INFO: Removed previous registry entry ${PROJECT_ID}" >&2
fi

echo "OK: Project '${PROJECT_ID}' renamed successfully" >&2
echo "  Target ID: ${TARGET_PROJECT_ID}" >&2
echo "  Target name: ${TARGET_PROJECT_NAME}" >&2
#!/usr/bin/env bash
# projects_activate.sh: Manage active project list
#
# Usage:
#   projects_activate.sh add <project_id...>     - Add projects to active list
#   projects_activate.sh remove <project_id...>  - Remove projects from active list
#   projects_activate.sh set <project_id...>      - Replace active list entirely
#   projects_activate.sh list                     - Display active projects
#
# Active projects stored in config/current_projects.yaml
# Uses yaml_write_flock.sh for atomic updates.
#
# Exit codes: 0=success, 1=error, 2=usage error

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECTS_DIR="${REPO_ROOT}/projects"
CONFIG_FILE="${REPO_ROOT}/config/current_projects.yaml"
YAML_WRITE="${SCRIPT_DIR}/yaml_write_flock.sh"

usage() {
  cat >&2 <<EOF
Usage: projects_activate.sh <command> [project_id...]

Commands:
  add <id...>      Add project IDs to active list
  remove <id...>   Remove project IDs from active list
  set <id...>      Replace active list with specified IDs
  list             Display currently active project IDs
EOF
  exit 2
}

if [[ $# -lt 1 ]]; then
  usage
fi

COMMAND="$1"
shift

# --- Helper: validate project ID exists in projects/ directory (Task 3.6) ---
validate_project_id() {
  local pid="$1"
  if [[ ! -f "${PROJECTS_DIR}/${pid}.yaml" ]]; then
    echo "ERROR: Project '${pid}' not found in ${PROJECTS_DIR}/" >&2
    echo "  Register it first with: scripts/project_register.sh --id ${pid} ..." >&2
    return 1
  fi
  return 0
}

# --- Helper: read current active IDs from config ---
read_active_ids() {
  if [[ ! -f "$CONFIG_FILE" ]]; then
    echo ""
    return
  fi
  # Parse YAML list items: lines matching "  - " under active_project_ids
  python3 -c "
import yaml, sys
try:
    with open('${CONFIG_FILE}', 'r') as f:
        data = yaml.safe_load(f) or {}
    ids = data.get('active_project_ids', []) or []
    for pid in ids:
        print(pid)
except Exception as e:
    sys.stderr.write(f'WARNING: Failed to parse {\"${CONFIG_FILE}\"}: {e}\n')
" 2>/dev/null
}

# --- Helper: write active IDs to config (Task 3.7) ---
write_active_ids() {
  local ids=("$@")
  local TIMESTAMP
  TIMESTAMP=$(date -u "+%Y-%m-%dT%H:%M:%SZ")
  
  local YAML_LIST=""
  if [[ ${#ids[@]} -eq 0 ]]; then
    YAML_LIST="active_project_ids: []"
  else
    YAML_LIST="active_project_ids:"
    for pid in "${ids[@]}"; do
      YAML_LIST+="
  - \"${pid}\""
    done
  fi

  local YAML_CONTENT="${YAML_LIST}
updated_at: \"${TIMESTAMP}\"
updated_by: \"script\""

  if ! "$YAML_WRITE" "$CONFIG_FILE" "$YAML_CONTENT"; then
    echo "ERROR: Failed to write active projects to ${CONFIG_FILE}" >&2
    return 1
  fi
}

case "$COMMAND" in
  # --- add: append project IDs to active list (Task 3.2) ---
  add)
    if [[ $# -lt 1 ]]; then
      echo "ERROR: 'add' requires at least one project ID" >&2
      usage
    fi

    # Validate all IDs first
    for pid in "$@"; do
      validate_project_id "$pid" || exit 1
    done

    # Read current IDs
    mapfile -t CURRENT_IDS < <(read_active_ids)

    # Merge: add new IDs that aren't already active
    MERGED=("${CURRENT_IDS[@]}")
    for pid in "$@"; do
      ALREADY=false
      for existing in "${CURRENT_IDS[@]}"; do
        if [[ "$existing" == "$pid" ]]; then
          ALREADY=true
          break
        fi
      done
      if [[ "$ALREADY" == false ]]; then
        MERGED+=("$pid")
      fi
    done

    write_active_ids "${MERGED[@]}" || exit 1
    echo "OK: Active projects: ${MERGED[*]}" >&2
    ;;

  # --- remove: remove project IDs from active list (Task 3.3) ---
  remove)
    if [[ $# -lt 1 ]]; then
      echo "ERROR: 'remove' requires at least one project ID" >&2
      usage
    fi

    # Read current IDs
    mapfile -t CURRENT_IDS < <(read_active_ids)

    # Filter out specified IDs (idempotent — removing non-active is silent)
    FILTERED=()
    for existing in "${CURRENT_IDS[@]}"; do
      REMOVE=false
      for pid in "$@"; do
        if [[ "$existing" == "$pid" ]]; then
          REMOVE=true
          break
        fi
      done
      if [[ "$REMOVE" == false ]]; then
        FILTERED+=("$existing")
      fi
    done

    write_active_ids "${FILTERED[@]}" || exit 1
    if [[ ${#FILTERED[@]} -eq 0 ]]; then
      echo "OK: No active projects" >&2
    else
      echo "OK: Active projects: ${FILTERED[*]}" >&2
    fi
    ;;

  # --- set: replace active list entirely (Task 3.4) ---
  set)
    if [[ $# -lt 1 ]]; then
      echo "ERROR: 'set' requires at least one project ID" >&2
      usage
    fi

    # Validate all IDs
    for pid in "$@"; do
      validate_project_id "$pid" || exit 1
    done

    # Deduplicate
    declare -A SEEN
    NEW_IDS=()
    for pid in "$@"; do
      if [[ -z "${SEEN[$pid]:-}" ]]; then
        NEW_IDS+=("$pid")
        SEEN[$pid]=1
      fi
    done

    write_active_ids "${NEW_IDS[@]}" || exit 1
    echo "OK: Active projects: ${NEW_IDS[*]}" >&2
    ;;

  # --- list: display active projects (Task 3.5) ---
  list)
    mapfile -t CURRENT_IDS < <(read_active_ids)
    if [[ ${#CURRENT_IDS[@]} -eq 0 ]] || [[ -z "${CURRENT_IDS[0]:-}" ]]; then
      echo "No active projects" >&2
    else
      echo "Active projects:" >&2
      for pid in "${CURRENT_IDS[@]}"; do
        if [[ -n "$pid" ]]; then
          echo "  - ${pid}" >&2
        fi
      done
    fi
    ;;

  *)
    echo "ERROR: Unknown command: ${COMMAND}" >&2
    usage
    ;;
esac

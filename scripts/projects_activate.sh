#!/usr/bin/env bash
# projects_activate.sh: Manage scoped active project lists
#
# Usage:
#   projects_activate.sh <scope> add <project_id...>     - Add projects to scope list
#   projects_activate.sh <scope> remove <project_id...>  - Remove projects from scope list
#   projects_activate.sh <scope> set <project_id...>     - Replace scope list entirely
#   projects_activate.sh <scope> list                    - Display scoped active projects
#
# Active projects stored in config/current_projects.yaml under project_scopes
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
Usage: projects_activate.sh <scope> <command> [project_id...]

Scopes:
  noctis_team
  lunafreya

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

if [[ $# -lt 2 ]]; then
  usage
fi

SCOPE="$1"
COMMAND="$2"
shift 2

validate_scope() {
  case "$1" in
    noctis_team|lunafreya)
      return 0
      ;;
    *)
      echo "ERROR: Unknown scope: $1" >&2
      usage
      ;;
  esac
}

other_scope() {
  if [[ "$1" == "noctis_team" ]]; then
    echo "lunafreya"
    return
  fi

  echo "noctis_team"
}

validate_scope "$SCOPE"

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
  local scope="$1"
  if [[ ! -f "$CONFIG_FILE" ]]; then
    echo ""
    return
  fi
  python3 "${SCRIPT_DIR}/lib/yaml_config_reader.py" active-ids "$scope" "$CONFIG_FILE" 2>/dev/null
}

# --- Helper: write active IDs to config (Task 3.7) ---
write_active_ids() {
  local scope="$1"
  shift
  local ids=("$@")
  local TIMESTAMP
  TIMESTAMP=$(date -u "+%Y-%m-%dT%H:%M:%SZ")

  local other
  other=$(other_scope "$scope")
  mapfile -t OTHER_IDS < <(read_active_ids "$other")

  local NOCTIS_IDS=()
  local LUNA_IDS=()
  if [[ "$scope" == "noctis_team" ]]; then
    NOCTIS_IDS=("${ids[@]}")
    LUNA_IDS=("${OTHER_IDS[@]}")
  else
    NOCTIS_IDS=("${OTHER_IDS[@]}")
    LUNA_IDS=("${ids[@]}")
  fi

  local render_scope_yaml
  render_scope_yaml() {
    local render_scope="$1"
    shift
    local render_ids=("$@")
    if [[ ${#render_ids[@]} -eq 0 ]]; then
      printf '  %s:\n    active_project_ids: []' "$render_scope"
      return
    fi

    printf '  %s:\n    active_project_ids:' "$render_scope"
    for pid in "${render_ids[@]}"; do
      printf '\n      - "%s"' "$pid"
    done
  }

  local YAML_CONTENT
  YAML_CONTENT="project_scopes:
$(render_scope_yaml "noctis_team" "${NOCTIS_IDS[@]}")
$(render_scope_yaml "lunafreya" "${LUNA_IDS[@]}")
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
    mapfile -t CURRENT_IDS < <(read_active_ids "$SCOPE")

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

    write_active_ids "$SCOPE" "${MERGED[@]}" || exit 1
    echo "OK: Active projects for ${SCOPE}: ${MERGED[*]}" >&2
    ;;

  # --- remove: remove project IDs from active list (Task 3.3) ---
  remove)
    if [[ $# -lt 1 ]]; then
      echo "ERROR: 'remove' requires at least one project ID" >&2
      usage
    fi

    # Read current IDs
    mapfile -t CURRENT_IDS < <(read_active_ids "$SCOPE")

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

    write_active_ids "$SCOPE" "${FILTERED[@]}" || exit 1
    if [[ ${#FILTERED[@]} -eq 0 ]]; then
      echo "OK: No active projects for ${SCOPE}" >&2
    else
      echo "OK: Active projects for ${SCOPE}: ${FILTERED[*]}" >&2
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

    write_active_ids "$SCOPE" "${NEW_IDS[@]}" || exit 1
    echo "OK: Active projects for ${SCOPE}: ${NEW_IDS[*]}" >&2
    ;;

  # --- list: display active projects (Task 3.5) ---
  list)
    mapfile -t CURRENT_IDS < <(read_active_ids "$SCOPE")
    if [[ ${#CURRENT_IDS[@]} -eq 0 ]] || [[ -z "${CURRENT_IDS[0]:-}" ]]; then
      echo "No active projects for ${SCOPE}" >&2
    else
      echo "Active projects for ${SCOPE}:" >&2
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

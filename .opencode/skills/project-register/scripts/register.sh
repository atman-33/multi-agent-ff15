#!/usr/bin/env bash
# project-register skill - register.sh
# Automates project registration: append to projects.yaml + create context file

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(dirname "$SCRIPT_DIR")"
FF15_ROOT="$(cd "$SKILL_ROOT/../../.." && pwd)"

PROJECTS_YAML="$FF15_ROOT/config/projects.yaml"
CONTEXT_DIR="$FF15_ROOT/context"
TEMPLATE_FILE="$FF15_ROOT/templates/context_template.md"

DRY_RUN="${DRY_RUN:-false}"

# ============================================================================
# Functions
# ============================================================================

usage() {
  cat << EOF
Usage: $0 <project_id> <name> <path> [priority] [status]

Parameters:
  project_id  Unique project identifier (kebab-case)
  name        Human-readable project name (quote if contains spaces)
  path        Absolute path to project directory
  priority    Priority level: high/medium/low (default: medium)
  status      Status: active/paused/completed (default: active)

Examples:
  $0 my-app "My App" "/home/user/repos/my-app"
  $0 client-x "Client X" "/mnt/c/Projects/client-x" high active

Environment Variables:
  DRY_RUN=true    Test without making changes

EOF
  exit 1
}

log() {
  echo "[project-register] $*" >&2
}

error() {
  log "ERROR: $*"
  exit 1
}

validate_project_id() {
  local id="$1"
  
  # Check format (kebab-case: lowercase letters, numbers, hyphens only)
  if ! [[ "$id" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
    error "Invalid project_id format: '$id'. Use kebab-case (e.g., my-project)"
  fi
  
  # Check for duplicates in projects.yaml
  if grep -q "id: $id" "$PROJECTS_YAML" 2>/dev/null; then
    error "Project ID '$id' already exists in $PROJECTS_YAML"
  fi
}

validate_path() {
  local path="$1"
  
  # Check if absolute path
  if ! [[ "$path" =~ ^/ ]]; then
    error "Path must be absolute: '$path'"
  fi
}

check_context_exists() {
  local project_id="$1"
  local context_file="$CONTEXT_DIR/${project_id}.md"
  
  if [[ -f "$context_file" ]]; then
    error "Context file already exists: $context_file"
  fi
}

append_to_projects_yaml() {
  local id="$1"
  local name="$2"
  local path="$3"
  local priority="$4"
  local status="$5"
  
  log "Appending to $PROJECTS_YAML..."
  
  if [[ "$DRY_RUN" == "true" ]]; then
    log "[DRY-RUN] Would append:"
    cat << EOF
  - id: $id
    name: "$name"
    path: "$path"
    priority: $priority
    status: $status
EOF
    return
  fi
  
  # Append entry (preserve indentation)
  cat >> "$PROJECTS_YAML" << EOF
  - id: $id
    name: "$name"
    path: "$path"
    priority: $priority
    status: $status
EOF
  
  log "✓ Appended to projects.yaml"
}

create_context_file() {
  local id="$1"
  local name="$2"
  local path="$3"
  local context_file="$CONTEXT_DIR/${id}.md"
  local today
  today="$(date +%Y-%m-%d)"
  
  log "Creating context file: $context_file..."
  
  if [[ "$DRY_RUN" == "true" ]]; then
    log "[DRY-RUN] Would create: $context_file"
    log "[DRY-RUN] Substitutions: {project_id}→$id, {name}→$name, {path}→$path, YYYY-MM-DD→$today"
    return
  fi
  
  # Create context directory if not exists
  mkdir -p "$CONTEXT_DIR"
  
  # Copy template and substitute placeholders
  sed -e "s/{project_id}/$id/g" \
      -e "s|{name}|$name|g" \
      -e "s|{path}|$path|g" \
      -e "s/YYYY-MM-DD/$today/g" \
      "$TEMPLATE_FILE" > "$context_file"
  
  log "✓ Created context file"
}

# ============================================================================
# Main
# ============================================================================

main() {
  # Parse arguments
  if [[ $# -lt 3 || $# -gt 5 ]]; then
    usage
  fi
  
  local project_id="$1"
  local name="$2"
  local path="$3"
  local priority="${4:-medium}"
  local status="${5:-active}"
  
  # Validate inputs
  log "Validating inputs..."
  validate_project_id "$project_id"
  validate_path "$path"
  check_context_exists "$project_id"
  
  # Check template exists
  if [[ ! -f "$TEMPLATE_FILE" ]]; then
    error "Template not found: $TEMPLATE_FILE"
  fi
  
  # Execute registration
  log "Registering project: $project_id"
  log "  Name: $name"
  log "  Path: $path"
  log "  Priority: $priority"
  log "  Status: $status"
  
  if [[ "$DRY_RUN" == "true" ]]; then
    log "[DRY-RUN MODE] No changes will be made"
  fi
  
  append_to_projects_yaml "$project_id" "$name" "$path" "$priority" "$status"
  create_context_file "$project_id" "$name" "$path"
  
  log "✓ Registration complete"
  
  if [[ "$DRY_RUN" != "true" ]]; then
    log ""
    log "Next steps:"
    log "  1. Review: cat config/projects.yaml"
    log "  2. Complete context: vim context/${project_id}.md"
    log "  3. Fill in: What, Why, Who, Tech Stack, Constraints, etc."
  fi
}

main "$@"

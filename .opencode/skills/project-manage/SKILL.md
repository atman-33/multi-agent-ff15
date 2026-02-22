---
name: project-manage
description: "(opencode-project - Skill) Manages external project registration and activation in the FF15 multi-agent system. Use when registering a new project, activating/deactivating projects, or listing active projects. Triggers on: 'register project', 'activate project', 'deactivate project', 'list active projects', 'add project', 'project management'."
metadata:
  author: multi-agent-ff15
  version: "2.0"
  created: "2026-02-22"
---

# project-manage

Registers external projects and manages active project state. Projects can have instruction files (AGENTS.md, CLAUDE.md, GEMINI.md) at their root, which are automatically detected and injected into agent context via the `project-instruction-injection` plugin.

## Commands

### 1. Register a New Project

Detects instruction files at the project root and stores metadata in `projects/<id>.yaml`.

```bash
scripts/project_register.sh \
  --id <project_id> \
  --name "<name>" \
  --root "<absolute_path>" \
  [--force]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--id`    | Yes      | Unique project identifier (e.g., `my-app`) |
| `--name`  | Yes      | Human-readable project name |
| `--root`  | Yes      | Absolute path to project root |
| `--force` | No       | Overwrite existing registration without prompting |

**Example:**

```bash
scripts/project_register.sh \
  --id "my-app" \
  --name "My App" \
  --root "/home/atman/repos/my-app"
```

Output: `projects/my-app.yaml` with detected instruction files and SHA256 hashes.

---

### 2. Manage Active Projects

Control which projects are currently active. Active projects have their instruction files injected into every agent message automatically.

```bash
# Add projects to active list (preserves existing)
scripts/projects_activate.sh add <project_id...>

# Remove projects from active list
scripts/projects_activate.sh remove <project_id...>

# Replace active list entirely
scripts/projects_activate.sh set <project_id...>

# Show currently active projects
scripts/projects_activate.sh list
```

**Example — enable two projects:**

```bash
scripts/projects_activate.sh add my-app another-project
```

**Example — switch to a single project:**

```bash
scripts/projects_activate.sh set my-app
```

**Example — deactivate all:**

```bash
scripts/projects_activate.sh remove my-app
```

---

## Typical Workflow

```bash
# 1. Register the project (auto-detects AGENTS.md, CLAUDE.md, GEMINI.md)
scripts/project_register.sh \
  --id "client-x" \
  --name "Client X" \
  --root "/home/atman/repos/client-x"

# 2. Activate it
scripts/projects_activate.sh add client-x

# 3. Verify
scripts/projects_activate.sh list
```

After activation, the `project-instruction-injection` plugin automatically adds a project-instruction-context block to every user message, listing instruction file paths for agents to read on demand.

---

## What Gets Stored

`projects/<id>.yaml`:

```yaml
id: "client-x"
name: "Client X"
root_path: "/home/atman/repos/client-x"
instruction_files:
  - type: agents
    path: "/home/atman/repos/client-x/AGENTS.md"
    exists: true
    sha256: "abc123..."
    last_checked_at: "2026-02-22T12:00:00Z"
  - type: claude
    path: "/home/atman/repos/client-x/CLAUDE.md"
    exists: false
    sha256: ""
    last_checked_at: "2026-02-22T12:00:00Z"
updated_at: "2026-02-22T12:00:00Z"
```

`config/current_projects.yaml`:

```yaml
active_project_ids:
  - "client-x"
updated_at: "2026-02-22T12:00:00Z"
updated_by: "script"
```

---

## Re-registering After Changes

If a project's instruction files are added or modified:

```bash
scripts/project_register.sh \
  --id "client-x" \
  --name "Client X" \
  --root "/home/atman/repos/client-x" \
  --force
```

The SHA256 hash will be updated. No need to re-activate.

---

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| Symlink detected | Project root contains symlinks | Use a real path |
| Project not found in projects/ | Activating unregistered ID | Run project_register.sh first |
| Cannot resolve path | Non-existent root path | Verify the path exists |
| Failed to write YAML | Lock timeout | Retry; check for stale .lock files |

## When to Use This Skill

- Starting work on a new external project
- Switching between client projects
- Onboarding multiple projects for parallel work
- Re-registering after instruction files were added or changed

**Don't use when:**
- Editing project metadata directly — edit `projects/<id>.yaml` manually
- The project has no instruction files — registration still works (with a warning)

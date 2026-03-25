---
name: project-manage
description: "(opencode-project - Skill) Manages external project registration and activation in the FF15 multi-agent system. Use when registering a new project, activating/deactivating projects, or listing active projects. Triggers on: 'register project', 'activate project', 'deactivate project', 'list active projects', 'add project', 'project management'."
metadata:
  author: multi-agent-ff15
  version: "2.2"
  created: "2026-02-22"
---

# project-manage

Registers external projects and manages active project state. Projects can have instruction files (AGENTS.md, CLAUDE.md, GEMINI.md) at their root, which are automatically detected and injected into agent context via the `project-instruction-injection` plugin.

## Commands

### 1. Register a New Project

Detects instruction files at the project root and stores metadata in `projects/<id>/project.yaml`.

```bash
scripts/project_register.sh \
  --id <project_id> \
  --name "<name>" \
  --root "<absolute_path>" \
  [--serena-project "<value>"] \
  [--force]
```

| Parameter | Required | Description |
|-----------|----------|--------------|
| `--id`    | Yes      | Unique project identifier (e.g., `my-app`) |
| `--name`  | Yes      | Human-readable project name |
| `--root`  | Yes      | Absolute path to project root |
| `--serena-project` | No | Value confirmed by `activate_project` (project name or path). When provided, stored as `serena_project` in the YAML. When omitted, the field is not written. |
| `--force` | No       | Overwrite existing registration without prompting |

**Example:**

```bash
# After confirming activation value (see Typical Workflow below)
scripts/project_register.sh \
  --id "my-app" \
  --name "My App" \
  --root "/home/atman/repos/my-app" \
  --serena-project "my-app"   # value confirmed by activate_project
```

Output: `projects/my-app/project.yaml` with detected instruction files and `serena_project`.

---

### 2. Manage Active Projects

Control which projects are currently active. Active projects have their instruction files injected into every agent message automatically.

```bash
# Add projects to active list (preserves existing)
scripts/projects_activate.sh <scope> add <project_id...>

# Remove projects from active list
scripts/projects_activate.sh <scope> remove <project_id...>

# Replace active list entirely
scripts/projects_activate.sh <scope> set <project_id...>

# Show currently active projects
scripts/projects_activate.sh <scope> list
```

**Example — enable two projects:**

```bash
scripts/projects_activate.sh noctis_team add my-app another-project
```

**Example — switch to a single project:**

```bash
scripts/projects_activate.sh noctis_team set my-app
```

**Example — deactivate all:**

```bash
scripts/projects_activate.sh noctis_team remove my-app
```

---

## Typical Workflow

```bash
# 1. Try activate_project to confirm the working value.
#    In WSL: UNC path → Linux path.
#    Outside WSL: project ID → absolute path.
#    Use whichever succeeds first as the --serena-project value.

# 2. Register the project with the confirmed value
scripts/project_register.sh \
  --id "client-x" \
  --name "Client X" \
  --root "/home/atman/repos/client-x" \
  --serena-project "<confirmed_value>"   # value confirmed in step 1

# 3. Add to active project list
scripts/projects_activate.sh noctis_team add client-x

# 4. Verify
scripts/projects_activate.sh noctis_team list
```

After activation, the `project-instruction-injection` plugin automatically adds a project-instruction-context block to every user message, listing instruction file paths for agents to read on demand.

---

## Serena Activation

Before registering, **confirm which value works** for `activate_project`.

In **WSL environments**, try in order and stop at first success:

1. **UNC path** (e.g., `\\wsl$\Ubuntu\home\atman\repos\client-x`)
2. **`root_path` as-is** (Linux path, e.g., `/home/atman/repos/client-x`)

Outside WSL, try in order and stop at first success:

1. **Project ID alone** (e.g., `client-x`) — fastest if already registered in Serena
2. **Absolute project path**

Pass the successful value as `--serena-project` when running `project_register.sh`. This ensures `serena_project` is set correctly in the YAML from the start.

**If registration was done without `--serena-project`**: re-register with `--force` after confirming the activation value.

---

## What Gets Stored

`projects/<id>/project.yaml`:

```yaml
id: 'client-x'
name: 'Client X'
root_path: '/home/atman/repos/client-x'
serena_project: '\\wsl$\Ubuntu\home\atman\repos\client-x'  # optional; use the confirmed Serena activation value
instruction_files:
  - path: '/home/atman/repos/client-x/AGENTS.md'
    enabled: true
```

`config/current_projects.yaml`:

```yaml
project_scopes:
  noctis_team:
    active_project_ids:
      - 'client-x'
  lunafreya:
    active_project_ids: []
updated_at: '2026-02-22T12:00:00Z'
updated_by: 'script'
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

Detected instruction files will be refreshed with `enabled: true`. No need to re-activate.

If `serena_project` is already present in the existing YAML, re-registering without `--serena-project` preserves that value.

Note: `project_register.sh` now writes YAML-safe single-quoted scalars for path-like fields. This avoids parse failures when `serena_project` contains backslashes, such as UNC paths in WSL.

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
- Editing project metadata directly — edit `projects/<id>/project.yaml` manually
- The project has no instruction files — registration still works (with a warning)

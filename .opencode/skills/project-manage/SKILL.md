---
name: project-manage
description: "(opencode-project - Skill) Registers external projects in the FF15 project registry and manages refresh, rename, and delete workflows. Use when registering a new project, re-registering after instruction file changes, renaming a registry entry, deleting a registry entry, or confirming how registry-backed projects are surfaced in the UI. Triggers on: 'register project', 'refresh project metadata', 'rename project', 'delete project', 'project registry', 'project management'."
metadata:
  author: multi-agent-ff15
  version: "4.0"
  created: "2026-02-22"
---

# project-manage

Registers external projects in the project registry and manages the lifecycle of existing registry entries. Projects can have instruction files such as `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` at their root; these are detected during registration and persisted in `projects/<id>/project.yaml`.

Execution and context assignment no longer use a global active-project list. After registration, choose `Execution Project` and `Context Projects` from the relevant Noctis mission or OpenCode session surface.

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

### 2. Refresh Registered Metadata

Refresh a project's detected metadata after adding or changing instruction files.

```bash
scripts/project_register.sh \
  --id "client-x" \
  --name "Client X" \
  --root "/home/atman/repos/client-x" \
  --force
```

If `serena_project` is already present in the existing YAML, re-registering without `--serena-project` preserves that value.

After registration, inspect the result in the Projects screen or by reading `projects/<id>/project.yaml`.

---

### 3. Rename or Re-Key a Registered Project

Updates the registry name, the registry ID, or both while preserving the existing working tree root and any stored `serena_project` value.

```bash
scripts/project_rename.sh \
  --id "client-x" \
  [--new-id "client-z"] \
  [--name "Client Z"] \
  [--force]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--id` | Yes | Current registered project identifier |
| `--new-id` | No | New project identifier when re-keying the registry entry |
| `--name` | No | New human-readable project name |
| `--force` | No | Skip overwrite prompts during re-registration |

At least one of `--new-id` or `--name` must be provided.

**Examples:**

```bash
# Rename only the display name
scripts/project_rename.sh \
  --id "client-x" \
  --name "Client X Platform"

# Change both the registry ID and display name
scripts/project_rename.sh \
  --id "client-x" \
  --new-id "client-platform" \
  --name "Client Platform" \
  --force
```

After the rename, refresh the Projects page manually to see the updated registry entry.

---

### 4. Delete a Registered Project

Removes a project from the FF15 registry only. It does **not** delete the underlying working tree.

```bash
scripts/project_delete.sh \
  --id "client-x" \
  [--force]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--id` | Yes | Registered project identifier to remove |
| `--force` | No | Skip the confirmation prompt |

**Example:**

```bash
scripts/project_delete.sh --id "client-x" --force
```

After deletion, refresh the Projects page manually to remove the entry from the list.

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

# 3. Verify the registry entry
cat projects/client-x/project.yaml

# 4. Use the registered project from the UI
#    - Projects page: browse metadata, Open Folder, VS Code
#    - Noctis mission / OpenCode session: pick Execution Project / Context Projects
```

Registered instruction files are later resolved through mission-local or session-local execution-context state. There is no standalone activation step.

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

`project_rename.sh` reuses `project_register.sh` internally so the same instruction-file refresh and YAML-safe quoting behavior apply during rename operations.

---

## Registry vs Runtime Selection

- Registration stores long-lived project metadata in `projects/<id>/project.yaml`.
- Runtime assignment happens per mission or session through `Execution Project` and `Context Projects`.
- The FF15 web app no longer provides a global active-project config file or activation CLI.

---

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| Symlink detected | Project root contains symlinks | Use a real path |
| Project not found in projects/ | Requested ID is not registered | Run project_register.sh first |
| Rename target already exists | `--new-id` already has a registry entry | Re-run with the correct target or pass `--force` after confirming overwrite |
| Cannot resolve path | Non-existent root path | Verify the path exists |
| Failed to write YAML | Lock timeout | Retry; check for stale .lock files |

## When to Use This Skill

- Starting work on a new external project
- Onboarding multiple projects for parallel work
- Re-registering after instruction files were added or changed
- Renaming a registry entry or correcting its display name
- Deleting a registry entry without touching the working tree
- Explaining how registered projects appear in Projects / mission / session UI

**Don't use when:**
- Selecting runtime execution or context for a mission/session — do that from the relevant UI surface
- The project has no instruction files — registration still works (with a warning)

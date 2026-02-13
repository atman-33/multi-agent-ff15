---
name: project-register
description: (opencode-project - Skill) Automates project registration in the FF15 multi-agent system. Use when Noctis needs to register a new project — automatically updates config/projects.yaml and creates context/{project_id}.md from template with basic information filled in. Triggers on phrases like 'register project', 'add new project', 'onboard project'.
metadata:
  author: multi-agent-ff15
  version: "1.0"
  created: "2026-02-13"
---

# project-register

Automates project registration by updating `config/projects.yaml` and creating a pre-filled context file from the template.

## Usage

Run the script from the skill directory:

```bash
.opencode/skills/project-register/scripts/register.sh <project_id> <name> <path> [priority] [status]
```

### Parameters

| Parameter | Required | Description | Default |
|-----------|----------|-------------|---------|
| `project_id` | ✅ Yes | Unique project identifier (kebab-case) | - |
| `name` | ✅ Yes | Human-readable project name | - |
| `path` | ✅ Yes | Absolute path to project directory | - |
| `priority` | ❌ No | Priority level: high/medium/low | `medium` |
| `status` | ❌ No | Status: active/paused/completed | `active` |

### Example: Basic Registration

```bash
.opencode/skills/project-register/scripts/register.sh \
  my-awesome-app \
  "My Awesome App" \
  "/home/atman/repos/my-awesome-app"
```

This will:
1. Append entry to `config/projects.yaml`:
   ```yaml
   - id: my-awesome-app
     name: "My Awesome App"
     path: "/home/atman/repos/my-awesome-app"
     priority: medium
     status: active
   ```
2. Create `context/my-awesome-app.md` from `templates/context_template.md` with:
   - `{project_id}` → `my-awesome-app`
   - `{name}` → `My Awesome App`
   - `{path}` → `/home/atman/repos/my-awesome-app`
   - `YYYY-MM-DD` → current date
   - All other placeholders left as TODO markers

### Example: With Priority and Status

```bash
.opencode/skills/project-register/scripts/register.sh \
  critical-client \
  "Critical Client Project" \
  "/mnt/c/Projects/critical-client" \
  high \
  active
```

## What Gets Automated

✅ **Automated**:
- Append to `config/projects.yaml`
- Create `context/{project_id}.md` from template
- Fill in: `project_id`, `name`, `path`, `Last Updated` date

❌ **Still Manual** (user must fill in):
- Project overview (What)
- Purpose and success definition (Why)
- Responsible person and stakeholders (Who)
- Tech stack
- Constraints
- Current state
- Decisions
- Notes

## Safety Features

- **Duplicate check**: Script validates `project_id` doesn't already exist in `projects.yaml`
- **Context file check**: Won't overwrite existing context file
- **YAML format preservation**: Maintains proper indentation and structure
- **Dry-run mode**: Test without making changes (see Advanced Usage)

## Critical Rules

1. **Run from FF15 project root** — Script expects `config/`, `context/`, `templates/` directories
2. **Use kebab-case for project_id** — e.g., `my-project`, not `my_project` or `MyProject`
3. **Absolute paths only** — Relative paths will cause issues across sessions
4. **Fill context manually after** — Script only fills basic info; complete the context file

## Advanced Usage

### Dry-Run Mode

Test without making changes:

```bash
DRY_RUN=true .opencode/skills/project-register/scripts/register.sh \
  test-project "Test Project" "/tmp/test"
```

### Check Existing Projects

```bash
cat config/projects.yaml
```

### Verify Context File

```bash
cat context/<project_id>.md
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "Project ID already exists" | Duplicate `project_id` in `projects.yaml` | Use different ID or update existing entry manually |
| "Context file already exists" | `context/{project_id}.md` exists | Remove existing file or use different ID |
| "Template not found" | Missing `templates/context_template.md` | Restore template file |
| "Invalid number of arguments" | Wrong parameter count | Check Usage section above |

## When to Use This Skill

**Use this skill when:**
- Starting work on a new project
- Onboarding a new client
- Adding a side project to track
- Migrating existing project to FF15 system

**Don't use this skill when:**
- Updating existing project info (edit YAML/context directly)
- Temporarily working on external code (no registration needed)
- Creating test/throwaway projects (too much overhead)

## Integration with Noctis Workflow

### Standard Flow

1. **User** (Crystal): "Register new project: client-x at /path/to/client-x"
2. **Noctis**: Runs this skill with provided parameters
3. **Noctis**: Confirms registration in dashboard.md
4. **Noctis**: Reminds user to complete context file manually

### Post-Registration Checklist

After running this skill, remind user to:
- [ ] Fill in "What" section (project overview)
- [ ] Fill in "Why" section (purpose, success definition)
- [ ] Fill in "Who" section (responsible person, stakeholders)
- [ ] Fill in "Tech Stack"
- [ ] Fill in "Constraints" (deadline, budget)
- [ ] Update "Current State" as work progresses

## Notes

- This skill is part of the FF15 multi-agent system's project management workflow
- Context files are the single source of truth for project knowledge
- All agents (Noctis, Comrades) read context files to understand project specifics
- Keep context files updated as projects evolve

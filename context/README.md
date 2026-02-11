# context Directory

Directory for managing project-specific context.

## Purpose
- Save knowledge and decisions for each project
- Share information between sessions
- Handover to new participants (Comrades)

## File Structure
```
context/
  README.md           ← This file
  {project_id}.md     ← Project-specific context
```

## Usage

### When Adding a New Project

**STEP 1: Copy the template**
```bash
cp templates/context_template.md context/{project_id}.md
```

**STEP 2: Edit the content**
- Replace placeholders like `{project_id}`, `{name}`, `{path}` with actual values
- Fill in required information for each section
- Unnecessary sections can be removed (flexible operation)

**STEP 3: Register in config/projects.yaml**
```yaml
projects:
  - id: {project_id}
    name: "{name}"
    path: "{path}"
    priority: high
    status: active
```

### When Starting Work (Comrades' Procedure)

**Context Loading Order**:
1. Read Memory MCP via `memory_read_graph()` (system-wide settings)
2. Read `context/{project_id}.md` (project-specific information)
3. Read `queue/tasks/{worker_name}.yaml` (your task)

### Template Structure

Refer to `templates/context_template.md` for the template.

Main sections:
- **Basic Information**: project_id, official name, path, Notion URL
- **What/Why/Who**: Project overview, purpose, organization
- **Tech Stack**: Language, framework, database
- **Constraints**: Limitations (deadline, budget, etc.)
- **Current State**: Progress status, next actions, blockers
- **Decisions**: Important decisions (table format)
- **Notes**: Notes and memos

## Update Rules
- Update immediately when important decisions are made
- Always update the last updated date
- Delete information that is no longer needed (keep it simple)
- Always include date and reason in the Decisions table

# context Directory

This directory is no longer the primary mechanism for project context management.

## Current System

Project context is now managed via:

```
scripts/project_register.sh      # Register project + detect instruction files
scripts/projects_activate.sh     # Manage active project list
config/current_projects.yaml     # Currently active project IDs (gitignored)
projects/<id>.yaml               # Per-project metadata with instruction file paths (gitignored)
```

See [docs/project-management.md](../docs/project-management.md) for the full workflow.


## Update Rules
- Update immediately when important decisions are made
- Always update the last updated date
- Delete information that is no longer needed (keep it simple)
- Always include date and reason in the Decisions table

# Supplementary Report Guidelines

When agents generate detailed reports, analysis documents, or large output files that are not the main task deliverable, output to `docs/reports/`.

## Mandatory YAML Frontmatter

**ALL files in `docs/reports/` MUST include YAML Frontmatter at the top.** Used by the desktop app to display the report list.

```yaml
---
title: "Clear, English title of the report"
author: "agent_name"
date: "2026-02-23T18:00:00Z"  # ISO 8601 format
tags: ["research", "design", "etc"]
---
```

## Output Location Rules

| Output Type | Location |
|-------------|----------|
| Detailed analysis reports | `docs/reports/` |
| Supplementary documents | `docs/reports/` |
| Large output files | `docs/reports/` |
| Main deliverables | As specified by user |
| YAML reports | `queue/inbox/` via `send_report.sh` |

## File Naming Convention

```
docs/reports/{task_type}-{agent_name}-{timestamp}.md
```

Examples:
- `docs/reports/analysis-ignis-20260215.md`
- `docs/reports/research-prompto-frameworks.md`

**Never clutter the root directory with supplementary files.**

## Format

````markdown
# Child Issues

## Overview

| Item | Value |
|------|-------|
| Parent Issue | #{parent issue number} |
| Parent URL | {parent issue url} |
| Total Child Issues | {count} |
| Language | {issue language} |

## Approved Breakdown

| Slice | Type | Blocked By | User Stories | Summary |
|-------|------|------------|--------------|---------|
| {slice title} | HITL / AFK | None / #{issue number} | {story numbers} | {summary} |

## Created Issues

| Issue | Title | Type | Blocked By | User Stories |
|------|-------|------|------------|--------------|
| #{issue number} | {issue title} | HITL / AFK | None / #{issue number} | {story numbers} |

## Notes

{summarize the created breakdown in 2-4 sentences}
````

## Rules

- `Parent Issue` and `Parent URL` must match `parent-prd-issue.md`
- `Approved Breakdown` must include only the slices approved by User
- `Created Issues` must record every actually created child issue, one row each, in dependency order
- `Blocked By` must be either `None` or a reference to an existing issue number
- `User Stories` must reference story numbers from the parent PRD

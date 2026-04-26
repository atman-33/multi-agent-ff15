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

## Rule

- `Parent Issue` と `Parent URL` は `parent-prd-issue.md` と一致させること
- `Approved Breakdown` には User が承認した slice だけを含めること
- `Created Issues` には実際に作成した全 child issue を dependency order で 1 行ずつ記録すること
- `Blocked By` は `None` か実在する issue 番号参照にすること
- `User Stories` は parent PRD の story 番号を参照すること
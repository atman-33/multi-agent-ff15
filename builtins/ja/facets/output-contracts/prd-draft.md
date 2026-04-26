## Format

````markdown
# PRD Draft

## Overview

| Item | Value |
|------|-------|
| PRD Key | {same key as requirements brief} |
| Language | {actual draft language} |
| Status | Drafted / Revised |

## GitHub Issue Title

{single-line issue title}

## GitHub Issue Body

<!-- prd-key: {same key as requirements brief} -->

## Problem Statement

{problem from the user's perspective}

## Solution

{solution from the user's perspective}

## User Stories

1. As an {actor}, I want {feature}, so that {benefit}

## Implementation Decisions

- {decision}

## Testing Decisions

- {decision}

## Out of Scope

- {out of scope item}

## Further Notes

{further note}
````

## Rule

- `PRD Key` は `requirements-brief.md` の値と一致させること
- `## GitHub Issue Title` は 1 行で記述し、GitHub issue にそのまま使える形にすること
- `## GitHub Issue Body` の先頭非空行は `<!-- prd-key: ... -->` にすること
- `## GitHub Issue Body` には write-a-prd skill の PRD template の全 section を含めること
- `Implementation Decisions` と `Testing Decisions` では具体的な file path や code snippet を書かないこと
- 改訂時は `Status` を `Revised` にし、GitHub に publish する source of truth として完結させること
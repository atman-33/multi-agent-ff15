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

## Rules

- `PRD Key` must match the value in `requirements-brief.md`
- Write `## GitHub Issue Title` on a single line in a form that can be used directly as a GitHub issue title
- The first non-empty line in `## GitHub Issue Body` must be `<!-- prd-key: ... -->`
- `## GitHub Issue Body` must include every section from the PRD template used by the write-a-prd skill
- Do not include concrete file paths or code snippets in `Implementation Decisions` or `Testing Decisions`
- When revising, set `Status` to `Revised` and make the draft complete enough to serve as the source of truth for GitHub publication

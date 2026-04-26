## Format

````markdown
# Change Brief

## Overview

| Item | Value |
|------|-------|
| Change Key | {stable kebab-case key} |
| Requested Language | {explicit user language or configured default} |
| Status | Clarified |

## Problem Statement

{summarize the user problem in 2-4 sentences}

## Success Criteria

- {criterion}
- {criterion}

## In Scope

- {item}

## Out of Scope

- {item}

## Constraints

- {constraint}

## Decisions

- {resolved decision}

## Open Questions

None
````

## Rules

- `Change Key` is required, and the same value must be kept for the same request across reruns or retries of the workflow
- In `Requested Language`, record the language explicitly requested by User when present; otherwise record a value that makes it clear the configured default was used
- Set `Status` to `Clarified` when the step is complete
- Set `Open Questions` to `None` when the step is complete
- Even when `Out of Scope` or `Constraints` is empty, write `None` explicitly
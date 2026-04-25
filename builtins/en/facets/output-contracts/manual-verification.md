## Format

````markdown
# Manual Verification Guide

## Overview

| Item | Value |
|------|-------|
| **Operation** | {operation name} |
| **Verified Change** | {change or feature summary} |
| **Intended User** | User |
| **Document Language** | {document language} |

## Preconditions

- [ ] Target environment, permissions, data, and configuration needed for verification are ready.
- [ ] The screens, APIs, jobs, notifications, or logs needed for verification can be inspected.

## Scenarios

### 1. Happy Path

- [ ] {describe the primary scenario step-by-step}
  Expected result:
  Evidence / notes:

### 2. Edge Cases Or Error Handling

- [ ] {describe an edge case or failure-mode scenario}
  Expected result:
  Evidence / notes:

### 3. Permissions Or Side Effects

- [ ] {describe a permission, notification, or side-effect check}
  Expected result:
  Evidence / notes:

## Open Items And Constraints

- Unverified items:
- Known constraints:

## Summary

{summarize the target scope, main scenarios, and notable constraints in 2-4 sentences}
````

## Rules

- `Verified Change` must reflect the implementation diff and the change details from the spec plan
- If the review report contains findings that still need verification, include them in a relevant scenario or open item
- Every checklist item must include both `Expected result` and `Evidence / notes`
- `Scenarios` must cover at least 3 concrete verification angles
- `Summary` must call out the main scenarios and any remaining constraints
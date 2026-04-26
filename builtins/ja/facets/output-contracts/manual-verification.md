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

## Rule

- `Verified Change` は実装差分と spec-plan の change 情報を反映すること
- review report に確認すべき指摘がある場合は、関連する scenario または open item に取り込むこと
- checklist item ごとに `Expected result` と `Evidence / notes` を必ず含めること
- `Scenarios` には少なくとも 3 つの具体的な確認観点を含めること
- `Summary` では主要シナリオと残る制約を明示すること
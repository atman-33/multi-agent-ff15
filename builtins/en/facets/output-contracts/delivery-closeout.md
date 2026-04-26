## Format

````markdown
# Delivery Closeout Report

## Overview

| Item | Value |
|------|-------|
| **Operation** | {operation name} |
| **Verified Change** | {change name or summary} |
| **Manual Verification Verdict** | Passed / Issues Found |
| **Document Language** | {document language} |

## Manual Verification

- User response:
- Remaining constraints or unverified items:

## Archive

- Archived change path:
- Spec sync status:
- Archive notes:

## Git

- Branch:
- Commit SHA:
- Commit message:

## Pull Request

- PR title:
- PR URL:
- Base branch:

## Summary

{summarize the manual verification outcome, archive result, commit state, and PR creation result in 2-4 sentences}
````

## Rules

- If `Manual Verification Verdict` is `Issues Found`, explain why archive, commit, and PR creation were skipped or deferred
- `Archived change path` must be the final archive directory when archive succeeds
- `Spec sync status` must explicitly say whether delta specs were synced to main specs
- `Commit SHA` must be the committed or retained HEAD SHA used for the PR
- `PR URL` must be the created pull request URL when PR creation succeeds
- `Summary` must state whether the workflow completed or returned for fixes
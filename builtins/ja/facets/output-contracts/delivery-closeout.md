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

## Rule

- `Manual Verification Verdict` が `Issues Found` の場合は、archive / commit / PR 作成を完了扱いにせず、なぜ見送ったかを明記すること
- archive に成功した場合、`Archived change path` には最終 archive directory を記録すること
- `Spec sync status` には delta specs を main specs へ同期したかどうかを明示すること
- `Commit SHA` には PR に使う commit の SHA を記録すること
- PR 作成に成功した場合、`PR URL` には作成した pull request の URL を記録すること
- `Summary` では workflow が完了したのか、fix に戻したのかを明示すること
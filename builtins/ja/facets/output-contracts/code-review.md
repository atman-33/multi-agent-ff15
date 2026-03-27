# Code Review — Output Contract

## レポート構成

```markdown
# Code Review Report

## Overview

| Item | Value |
|------|-------|
| **Operation** | {operation name} |
| **Reviewed Movement** | {レビュー対象の movement} |
| **Verdict** | Approved / Needs Fix / Critical Issues |

## Requirements Verification

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| R1 | {spec の要件} | Fulfilled / Partial / Not Addressed | {file:line または説明} |
| R2 | {spec の要件} | Fulfilled / Partial / Not Addressed | {file:line または説明} |

## Findings

### Blocking

| ID | Location | Description | Evidence | Policy Ref |
|----|----------|-------------|----------|------------|
| REV-001 | {file}:{line} | {問題の説明} | {なぜ問題なのか} | {該当する policy rule} |

### Non-Blocking

| ID | Location | Description | Recommendation |
|----|----------|-------------|----------------|
| REV-NB-001 | {file}:{line} | {観察内容} | {改善提案} |

## Test Coverage

| Area | Status | Notes |
|------|--------|-------|
| {component/module} | Covered / Partial / Missing | {詳細} |

## Summary

{レビュー結果を 2〜3 文で要約}
```

## ルール

- すべての blocking finding には `Location`（file:line）と `Evidence` が必要
- `Policy Ref` は、該当する場合に policy facet の具体的な rule を参照すること
- blocking finding がなければ Verdict は "Approved" でなければならない
- blocking finding があるなら Verdict は "Needs Fix" でなければならない
- 設計上の根本問題がある場合、Verdict は "Critical Issues" でもよい
- non-blocking finding は verdict に影響しない

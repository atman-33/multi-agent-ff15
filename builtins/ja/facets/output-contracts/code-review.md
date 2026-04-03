## Format

````markdown
# Code Review Report

## Overview

| Item | Value |
|------|-------|
| **Operation** | {operation name} |
| **Reviewed Step** | {review target step} |
| **Verdict** | Approved / Needs Fix / Critical Issues |

## Requirements Verification

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| R1 | {spec requirement} | Fulfilled / Partial / Not Addressed | {file:line or explanation} |
| R2 | {spec requirement} | Fulfilled / Partial / Not Addressed | {file:line or explanation} |

## Findings

### Blocking

| ID | Location | Description | Evidence | Policy Ref |
|----|----------|-------------|----------|------------|
| REV-001 | {file}:{line} | {issue description} | {why this is a problem} | {relevant policy rule} |

### Non-Blocking

| ID | Location | Description | Recommendation |
|----|----------|-------------|----------------|
| REV-NB-001 | {file}:{line} | {observation} | {recommended improvement} |

## Test Coverage

| Area | Status | Notes |
|------|--------|-------|
| {component/module} | Covered / Partial / Missing | {details} |

## Summary

{summarize the review result in 2-3 sentences}
````

## Rule

- すべての blocking finding には `Location` と `Evidence` を含め、`Location` は `file:line` 形式にすること
- `Policy Ref` は該当する場合に policy facet の具体的な rule を参照すること
- blocking finding がなければ `Verdict` は `Approved` にすること
- blocking finding があるなら `Verdict` は `Needs Fix` にすること
- 設計上の根本問題がある場合のみ `Verdict` に `Critical Issues` を使ってよい
- non-blocking finding は `Verdict` を変えない

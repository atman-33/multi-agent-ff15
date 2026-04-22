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

## Rules

- Every blocking finding must include both `Location` and `Evidence`, and `Location` must use `file:line` format
- When applicable, `Policy Ref` must point to the concrete rule from the relevant policy facet
- If there are no blocking findings, `Verdict` must be `Approved`
- If there are blocking findings, `Verdict` must be `Needs Fix`
- Use `Critical Issues` only when there is a fundamental design problem
- Non-blocking findings must not change the `Verdict`

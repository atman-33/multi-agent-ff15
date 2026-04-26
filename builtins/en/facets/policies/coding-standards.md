# Coding Standards — Policy

## Purpose

Quality criteria and judgment rules for implementation and review steps.
These rules define what is acceptable (`APPROVE`) and what must be fixed (`REJECT`).

---

## REJECT Conditions (Blocking)

| ID | Rule | REJECT When |
|----|------|-------------|
| CS-001 | Type Safety | `any` is used without justification, or type assertions are used without explanatory comments |
| CS-002 | Error Handling | Errors are silently swallowed, there is an empty catch block, or error propagation is insufficient |
| CS-003 | Test Coverage | There is no test covering a new code path |
| CS-004 | Dead Code | Commented-out code remains, there are unused imports, or unreachable code exists |
| CS-005 | Scope Creep | Changes outside the defined task scope are included without explicit justification |
| CS-006 | Breaking Change | A public API contract is changed without a migration path |
| CS-007 | Security | User input is not validated, there is risk of SQL or command injection, or secrets are hardcoded |
| CS-008 | Incomplete Implementation | TODO or FIXME stubs remain on production paths, or placeholder return values are left in place |
| CS-009 | Convention Violation | File naming, directory structure, or patterns deviate from project conventions |
| CS-010 | Failing Tests | Existing tests are broken by the change, or new tests do not actually assert anything |

## APPROVE Conditions

| ID | Rule | APPROVE When |
|----|------|--------------|
| AP-001 | Spec Compliance | The implementation addresses every requirement in the spec |
| AP-002 | Test Pass | All tests pass (existing and new) |
| AP-003 | Type Check | There are no TypeScript errors |
| AP-004 | Lint Clean | No new lint warnings are introduced |
| AP-005 | Minimal Diff | The change is focused on the task and avoids unrelated fixes |

## Judgment Guidelines

- If there is even one REJECT finding, the overall verdict becomes `Needs Fix`
- Multiple non-blocking findings still do not cause rejection
- When judgment is borderline, use "would this cause a runtime failure?" as the standard. If not, treat it as non-blocking
- Prefer concrete statements over abstract ones. For example, write `CS-003: handleSubmit() at form.tsx:42 has no test` instead of `Missing tests`

# Pull Request Template

<!-- Use this template for all feature, fix, and documentation PRs. -->

## Title

- Short, descriptive title (e.g. "feat(auth): add JWT refresh endpoint")

## Summary

- One-paragraph summary of the change and the problem it solves.

## Related issue / ticket

- Link to related issue(s) or ticket(s) (e.g. `Fixes #123`, or `JIRA-456`).

## What changed

- High-level list of changes made (files, modules, behavior).

## How to test

### Manual steps

1. Step-by-step manual verification instructions.
2. Test data or commands to reproduce.

### Automated tests

- Unit / integration / e2e tests included (list test commands and targets).

## CI / required checks

- Required CI checks (examples):
  - build
  - lint
  - tests (unit + integration)
  - typecheck

## Verification checklist (0-errors confirmation)

- [ ] Build completes without errors
- [ ] Lint returns no errors/warnings (or acceptable warnings documented)
- [ ] All tests pass (local + CI)
- [ ] Type checks pass (if applicable)
- [ ] No secrets or credentials added
- [ ] Documentation updated (if applicable)

## Migration / Backwards-compatibility notes

- Describe any migrations required (DB schema, data migration, API versioning) and compatibility considerations.

## Security / Privacy considerations

- Note any security or privacy impacts (data exposure, permissions, encryption). If none, state "No security/privacy impact.".

## Impact assessment (PR size / risk)

- Estimated PR size: small / medium / large
- Risk level: low / medium / high
- Areas affected (components, services)

## Labels

- Suggested labels: area:, priority:, type:

## Reviewer suggestions

- Initial reviewer candidates (suggested team members):
  - @ignis (architecture & design)
  - @gladiolus (integration & robustness)
  - @prompto (docs & examples)
  - @noctis (final approval)

## Release notes

- Short note for release changelog (if applicable).

## Additional notes

- Any other information reviewers should know.

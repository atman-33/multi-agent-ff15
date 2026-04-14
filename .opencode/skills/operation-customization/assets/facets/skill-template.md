---
name: <skill-name>
description: '<Capability sentence>. Use when <trigger keywords, file types, or change surfaces>.'
---

Replace every placeholder and localize the final file body to the target facet language.
Keep `name` and `description` machine-readable and non-empty.
Keep `name` in lowercase letters, numbers, and hyphens only, and match the enclosing `<skill-name>` directory.
Treat `description` as the discovery surface: sentence 1 states the capability; sentence 2 starts with `Use when ...`.
Keep `SKILL.md` focused on the core workflow. Move advanced rules or many examples into sibling `REFERENCE.md` or `EXAMPLES.md`.
Add `scripts/` only for deterministic, reusable tasks such as validation or formatting.

# <Skill Title>

## Purpose

<One short paragraph explaining the capability, scope, and why this skill exists.>

## When To Read

- <Trigger, request type, file type, or change surface 1>
- <Trigger, keyword, or situation 2>
- <Optional boundary or exclusion>

## Key Facts

- <Invariant, contract, or rule 1>
- <Invariant, contract, or rule 2>
- <Invariant, contract, or rule 3>

## Workflow

1. <Step 1>
2. <Step 2>
3. <Step 3>

## References

- See [REFERENCE.md](REFERENCE.md) for advanced rules.
- See [EXAMPLES.md](EXAMPLES.md) for usage examples.

Remove this section if no sibling reference files are needed.

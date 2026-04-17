---
name: manual-verification-docs
description: Organize post-implementation manual verification steps and expected results into a checklist-oriented dated Markdown report. Use when the user asks for verification steps, acceptance checks, expected outcomes, or manual test notes after implementation.
---

# Manual Verification Docs

Create a human-friendly manual verification guide for AI-agent changes and store it as Markdown in `docs/reports/`.

## Quick start

1. Collect the implementation scope, changed files, intended users, and impact area.
2. Run the scaffold generator.

```bash
python3 .opencode/skills/manual-verification-docs/scripts/create_verification_doc.py --slug <topic> --title "<verification target>"
```

3. Fill in the generated `docs/reports/YYYYMMDD-*.md` file with checklist items, expected results, evidence notes, and open items.
4. Share the created file path with the user and confirm that no important scenarios are missing.

## Workflow

### 1. Define the verification scope

- Identify what must be verified to determine whether the change succeeds.
- List affected surfaces such as screens, APIs, jobs, permissions, and notifications.
- Separate automated coverage that already exists from areas that still need manual checks.

### 2. Generate the scaffold

- Use lowercase kebab-case for `--slug`.
- Always write the generated file to `docs/reports/`.
- Keep the file name in `YYYYMMDD-xxx.md` format.

### 3. Make the guide concrete

- Document startup steps, required data, permissions, and configuration values in the prerequisites section.
- For each scenario, create checklist items that a user can mark off one by one.
- Under every checklist item, include the expected result and an evidence or notes field.
- Make every expected result observable and specific.
- Record unverified items or known constraints at the end.

### 4. Review with the user

- Confirm that the intended verification environment matches reality.
- Check for missing happy paths, error paths, and permission scenarios.
- If needed, add another file instead of overwriting an existing one.

## Rules

- Write every file in this skill and every generated verification document in English.
- Describe reproducible verification steps, not implementation internals.
- Use checklist items for actionable verification work.
- Include a matching expected result for every checklist item.
- Leave space for evidence, notes, or blockers under each checklist item.
- Place the output in `docs/reports/`.
- Create a new dated file even when regenerating on the same day.

## Output

- Output directory: `docs/reports/`
- Scaffold generator: `.opencode/skills/manual-verification-docs/scripts/create_verification_doc.py`

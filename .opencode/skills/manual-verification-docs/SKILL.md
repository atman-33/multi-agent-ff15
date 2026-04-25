---
name: manual-verification-docs
description: Organize post-implementation manual verification steps and expected results into a checklist-oriented dated Markdown report. Use when the user asks for verification steps, acceptance checks, expected outcomes, or manual test notes after implementation.
---

# Manual Verification Docs

Create a human-friendly manual verification guide for AI-agent changes at a caller-specified Markdown path.

## Quick start

1. Collect the implementation scope, changed files, intended users, and impact area.
2. Decide the output location with the caller. When used inside an operation, prefer the mission-scoped output file path from the step output contract. When used standalone, pass either an explicit output path or an output directory.
3. Run the scaffold generator.

```bash
python3 .opencode/skills/manual-verification-docs/scripts/create_verification_doc.py --slug <topic> --title "<verification target>" --output-path <path>
```

4. Fill in the generated Markdown file with checklist items, expected results, evidence notes, and open items.
5. Share the created file path with the user and confirm that no important scenarios are missing.

## Workflow

### 1. Define the verification scope

- Identify what must be verified to determine whether the change succeeds.
- List affected surfaces such as screens, APIs, jobs, permissions, and notifications.
- Separate automated coverage that already exists from areas that still need manual checks.

### 2. Generate the scaffold

- Use lowercase kebab-case for `--slug`.
- If the caller provides `--output-path`, write exactly that file and do not create a second copy anywhere else.
- If the caller provides `--output-dir`, create a dated file in `YYYYMMDD-xxx.md` format inside that directory.

### 3. Make the guide concrete

- Document startup steps, required data, permissions, and configuration values in the prerequisites section.
- For each scenario, create checklist items that a user can mark off one by one.
- Under every checklist item, include the expected result and an evidence or notes field.
- Make every expected result observable and specific.
- Record unverified items or known constraints at the end.

### 4. Review with the user

- Confirm that the intended verification environment matches reality.
- Check for missing happy paths, error paths, and permission scenarios.
- If the caller gave an exact output path, update that file rather than creating another copy.
- If the caller gave only an output directory, add another dated file only when a separate guide is truly needed.

## Rules

- Write this skill file, examples, and script-facing text in English.
- Write the generated verification document in the caller-requested language, and default to English only when no language was specified.
- Describe reproducible verification steps, not implementation internals.
- Use checklist items for actionable verification work.
- Include a matching expected result for every checklist item.
- Leave space for evidence, notes, or blockers under each checklist item.
- Use only the caller-specified output path or output directory.
- Do not create duplicate copies in another workspace, repository, or reports directory unless the caller explicitly asks for more than one file.

## Output

- Output location: caller-specified via `--output-path` or `--output-dir`
- Scaffold generator: `.opencode/skills/manual-verification-docs/scripts/create_verification_doc.py`

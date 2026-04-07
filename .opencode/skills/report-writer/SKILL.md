---
name: report-writer
description: Create or update a supplementary report when the user asks レポートにまとめて レポートを作成して report this summarize into a report create a report or write findings to docs/reports.
metadata:
  short-description: Create or update repository reports
---

# Report Writer

Use this skill when the user wants a report file, not just an in-chat summary.

## What This Skill Does

- creates a report file in `docs/reports/`
- adds YAML frontmatter automatically
- defaults the report language from `config/settings.yaml`
- uses a dated kebab-case filename

## Workflow

1. Derive a short report title from the user request.
2. Run the generator script first.
3. Write or update the generated file.
4. If an older report is superseded, move it to `docs/reports/archive/`.

## Generator Script

Run:

```bash
node .opencode/skills/report-writer/scripts/create-report.mjs --title "<report title>"
```

Optional arguments:

- `--slug <ascii-slug>` when the title is non-ASCII and you want a stable filename
- `--tags tag1,tag2`
- `--author <name>`
- `--language <code>` to override `config/settings.yaml`

The script prints JSON with the created file path and selected language.

## Writing Rules

- Put reports in `docs/reports/`.
- Keep reports concise and decision-oriented.
- Choose headings freely based on what best fits the content — do not use a fixed heading structure.
- State the most important context (scope, purpose, or constraints) near the top of the report.
- Add follow-up items only when work is deferred.
- Treat paths as relative to the repository root unless stated otherwise.
- When revising an existing report, always create a new file (e.g. append `-v2`, `-v3` to the slug via `--slug`) rather than overwriting the original. Move the superseded version to `docs/reports/archive/` after the new file is created.

## Trigger Examples

- `レポートにまとめて`
- `レポートを作成して`
- `調査内容をレポート化して`
- `summarize this into a report`
- `create a report for this`

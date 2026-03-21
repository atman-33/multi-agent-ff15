# multi-agent-ff15-re

## Reports

- Use `.opencode/skills/report-writer/` when the user asks to create, update, or summarize into a report.
- Write supplementary reports in `docs/reports/`.
- Move archived or superseded reports to `docs/reports/archive/`.
- Reports are local artifacts of this repository.
- Unless the user instructs otherwise, write reports in the language from `config/settings.yaml` `language`.
- Treat report paths as relative to this repository root unless stated otherwise.

## Forbidden Actions

**Universal rule (all agents)**: NEVER perform any git operation unless the user explicitly instructs you.

## Git Workflow Protocol

**NEVER perform any git operation (branch, commit, push, PR) unless the user explicitly instructs you to do so.**

When instructed: create feature branch -> commit -> push -> `gh pr create` -> report PR URL -> STOP (do not merge).

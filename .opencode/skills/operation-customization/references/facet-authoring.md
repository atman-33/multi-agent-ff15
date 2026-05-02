# Facet Authoring Reference

Read this file when creating or revising files under `builtins/<lang>/facets/` or `projects/<project-id>/facets/`.

## Start From Template

- [job-template.md](../assets/facets/job-template.md)
- [instruction-template.md](../assets/facets/instruction-template.md)
- [skill-template.md](../assets/facets/skill-template.md)
- [policy-template.md](../assets/facets/policy-template.md)
- [output-contract-report-template.md](../assets/facets/output-contract-report-template.md)
- [output-contract-frontmatter-template.md](../assets/facets/output-contract-frontmatter-template.md)

Pick the smallest template that matches the artifact you are creating. Remove all placeholder text and localize the final content to the target facet language.

## General Rules

- Match the tone, language, and structure of neighboring files in the same locale.
- Prefer updating existing reusable facets over creating new top-level patterns.
- Use file-backed facets for reusable content and inline blocks for step-local details.
- Keep the facet path valid relative to the workflow YAML that consumes it. `file` sources are resolved from the workflow file, not from repository root.
- When builtin and project workflows share a visible name, use facet content and workflow descriptions to make the source-specific intent clear.

## jobs

- Describe the stable role, responsibilities, decision principles, and prohibitions.
- Keep the content reusable across multiple workflows.
- Do not put step-local sequencing or task-specific output handling here.

## instructions

- Describe the execution procedure for one step.
- Prefer numbered actions, explicit references, blocking conditions, and completion criteria.
- Do not ask for routine User-facing progress updates unless the workflow explicitly requires checkpoints, approvals, or interactive monitoring.
- Put step-specific placeholder usage or command references here.
- Supported dynamic placeholders in instructions currently include `{{ output("<step>", "latest", "<artifact>") }}` for prior workflow artifacts, `{{ setting("language", "name") }}` for configured report-language wording, `{{ root("app_root") }}` for app-owned paths, and `{{ root("execution_root") }}` for mission execution-target paths.
- Prefer file-backed instructions when the procedure is long, uses several placeholders, or is followed by step-level siblings such as `output_contracts`, `policies`, `delegation`, or `rules`.
- When you do keep a multiline `inline: |`, re-check indentation after the block so sibling step fields remain siblings of `instruction:` instead of becoming nested keys inside the content source.

## skills

- Use for background context, runtime contracts, diagnostics maps, and reusable reference material.
- Skills are file-backed only and should live under `facets/skills/<skill-name>/SKILL.md`.
- Valid skill frontmatter requires both `name` and `description`.
- Skill `name` must use lowercase letters, numbers, and hyphens only.
- Skill `name` must match the enclosing `<skill-name>` directory.
- Treat `description` as the discovery surface. Sentence 1 states the capability. Sentence 2 starts with `Use when ...` and names concrete triggers.
- Prompt injection includes `name`, `description`, and the absolute `file` path, not the full body.
- When a listed skill is relevant, read the file at `<file>` and treat that file as the source of truth.
- Do not author inline workflow skills. Use a file-backed skill entry instead.
- Do not assume frontmatter metadata works for jobs, instructions, policies, or output-contracts. That special handling is skill-specific.
- Keep `SKILL.md` focused on the core workflow. If it grows beyond roughly 100 lines, mixes distinct domains, or needs many examples, move extra material to sibling `REFERENCE.md` or `EXAMPLES.md`.
- Add `scripts/` only for deterministic repeated tasks such as validation, formatting, or explicit error handling.
- Prefer short sections such as `Purpose`, `When To Read`, `Key Facts`, and `Workflow`. Add `References` only when sibling files exist.

## policies

- Encode explicit pass or fail, approve or reject, or must or must-not criteria.
- Prefer concrete rules and judgment guidance over broad advice.
- Include borderline interpretation guidance when useful.

## output-contracts

- Define the exact report or artifact structure the agent must produce.
- Use output contracts for persisted workflow artifacts, not routine chat updates to User.
- Put headings, tables, and placeholders in `## Format`.
- Put validation and verdict rules in `## Rule`.
- Keep filename expectations synchronized with `output_contracts.report[].name` and any `output(...)` references.

## Template Selection

- Use the skill template for reusable file-backed skills whose prompt injection should expose only `name` and `description`, with optional sibling `REFERENCE.md`, `EXAMPLES.md`, or `scripts/` when the core file would stop being concise.
- Use the frontmatter output-contract template for machine-readable artifacts such as spec pointers.
- Use the report output-contract template for human-readable markdown reports.

## Review Before Finish

- `description` states both capability and trigger.
- `name` matches the enclosing directory.
- Placeholder text is fully removed.
- References stay one level deep from `SKILL.md`.
- Time-sensitive or verbose material is moved out of the core file when possible.
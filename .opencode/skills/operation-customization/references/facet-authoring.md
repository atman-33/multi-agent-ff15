# Facet Authoring Reference

Read this file when creating or revising files under `builtins/<lang>/facets/` or `projects/<project-id>/facets/`.

## Start From Template

- [job-template.md](../assets/facets/job-template.md)
- [instruction-template.md](../assets/facets/instruction-template.md)
- [knowledge-body-template.md](../assets/facets/knowledge-body-template.md)
- [knowledge-reference-template.md](../assets/facets/knowledge-reference-template.md)
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

## knowledge

- Use for background context, runtime contracts, diagnostics maps, and reusable reference material.
- For file-based knowledge facets, use frontmatter when you want the prompt to inject a compact reference instead of the whole body.
- Valid reference-mode frontmatter requires both `name` and `description`.
- If file-based knowledge frontmatter is missing or malformed, the system falls back to body injection.
- Inline knowledge is always treated as body content. Do not expect frontmatter behavior there.
- Do not assume frontmatter metadata works for jobs, instructions, policies, or output-contracts. That special handling is knowledge-specific.

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

- Use the knowledge reference template only for file-based knowledge that should surface metadata in prompts.
- Use the knowledge body template for inline knowledge and for file-based knowledge that should inject the full body.
- Use the frontmatter output-contract template for machine-readable artifacts such as spec pointers.
- Use the report output-contract template for human-readable markdown reports.
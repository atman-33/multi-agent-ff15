---
name: operation-customization
description: 'Create or customize repository operations and facet files. Use when adding or editing builtin or project-authored workflow YAML, jobs, instructions, skills, policies, or output-contracts, or when diagnosing operation routing, prompt composition, output placeholders, source-aware operation refs, and debug-preview behavior.'
argument-hint: 'Describe the operation or facet files to create or change, whether the workflow lives under builtins or projects, the target language or project id, and whether you need authoring only or diagnostics too.'
---

# Operation Customization

Create or revise operation workflows for this repository without breaking the runtime-mediated contract.

## When to Use

- Add a new operation under `builtins/<lang>/operations/` or `projects/<project-id>/operations/`
- Extend or refactor an existing operation step flow
- Add or revise `steps[].delegation` for Noctis-owned autonomous flows
- Create or revise `jobs`, `instructions`, `skills`, `policies`, or `output-contracts` facets under builtin or project facet trees
- Diagnose operation prompt, routing, report transport, source-aware catalog, or output placeholder failures

## Workflow

1. Confirm the target operation, source tree (`builtins` or `projects/<project-id>`), language or project id, and whether the task includes diagnostics.
2. Read the references that match the task:
   - For canonical YAML rules, runtime contracts, and parser constraints, read [operation-authoring.md](./references/operation-authoring.md).
   - For facet-specific writing guidance, read [facet-authoring.md](./references/facet-authoring.md). For skill facets, this bundled reference and template are the complete authoring guide.
   - For routing, prompt, or placeholder failures, read [operation-diagnostics.md](./references/operation-diagnostics.md).
3. Inspect the closest existing operation and neighboring facet files before drafting.
4. When creating files from scratch, start from the matching templates in `./assets/`. Use the dedicated autonomous delegation template for rules-less Noctis-owned parent steps.
5. Decide what should stay reusable in file-backed facets and what should remain step-local inline content.
6. Edit the operation YAML and the required facet files.
7. Run the bundled validator on every created or modified workflow YAML:
   - `node .opencode/skills/operation-customization/scripts/validate-operation-yaml.mjs <path-to-operation.yaml>`
   - You may pass multiple files or an operations directory.
8. Validate any runtime-specific concerns that the script cannot prove, such as placeholders, debug-preview behavior, and delegated child-task return paths.
9. Summarize created or changed files, workflow assumptions, validator results, and any unresolved ambiguity.

## Critical Parser Trap

- For standard routed workflows, the `initial_step` may not route directly to `ABORT` or `COMPLETE`.
- If the initial step needs a failure or blocked branch, route it to a named non-initial step and let that later step choose `ABORT` or `COMPLETE`.
- Re-check copied template snippets against `references/operation-authoring.md` before finishing instead of trusting placeholder transitions verbatim.

## Bundled Assets

- Use [operation-template.yaml](assets/operation-template.yaml) for standard routed operations.
- Use [autonomous-delegation-template.yaml](assets/autonomous-delegation-template.yaml) for internal Noctis-owned autonomous flows that keep the parent step open while delegating child tasks.
- Use [job-template.md](assets/facets/job-template.md) for reusable step roles.
- Use [instruction-template.md](assets/facets/instruction-template.md) for file-backed instructions or inline content.
- Use [skill-template.md](assets/facets/skill-template.md) for reusable file-backed skills under `facets/skills/<skill-name>/SKILL.md`. It includes the canonical description pattern, section layout, and split or script thresholds.
- Use [policy-template.md](assets/facets/policy-template.md) for pass or fail criteria.
- Use [output-contract-report-template.md](assets/facets/output-contract-report-template.md) for markdown report artifacts.
- Use [output-contract-frontmatter-template.md](assets/facets/output-contract-frontmatter-template.md) for machine-readable frontmatter artifacts.

## Bundled Script

- Use [validate-operation-yaml.mjs](scripts/validate-operation-yaml.mjs) after authoring or editing operation YAML.
- The validator checks YAML parseability, removed legacy fields, content-source shape, file-backed facet paths, step ownership, `next` targets, and the `initial_step` terminal-transition trap.
- Treat validator failures as blocking until resolved.

## Ask Only If Blocked

- Which operation should be created or changed?
- Is this a standard routed workflow or a rules-less autonomous delegation flow?
- Which step owners and transitions are expected?
- Are there required outputs or placeholders that downstream steps will consume?
- Which facet content must be reusable across workflows?

## Guardrails

- Keep this file lean. Put detailed rules and examples in `references/`.
- Default to the fewest steps that satisfy ownership, artifact boundaries, and required approvals.
- Do not add User-facing progress updates or Noctis relay steps unless checkpoints, approvals, or interactive monitoring were explicitly requested.
- Do not stretch the generic operation template into a rules-less delegation pattern; use the dedicated autonomous delegation template instead.
- Prefer adapting neighboring repository patterns over inventing new structures.
- Keep same-name builtin and project workflows as separate candidates; do not document or implement name-based collapsing.
- For `facets/skills/<skill-name>/SKILL.md`, keep frontmatter `name` in lowercase kebab-case and match the enclosing `<skill-name>` directory.
- Treat unresolved placeholders, legacy schema fields, and malformed output contracts as blocking.
- Do not skip the validator for "small" workflow edits. A one-line rule change can still break catalog loading for the whole language tree.
- When runtime behavior changes, inspect both live-path and debug-preview implications before finishing.
- If the workflow is internal-only, keep the internal operation name out of normal user-facing operation lists.

## Completion Criteria

- Every step has a clear owner, job, instruction, and rules.
- A rules-less step is only used for an explicit Noctis-owned autonomous delegation flow.
- The `initial_step` points to a `noctis` step and that step does not route directly to `ABORT` or `COMPLETE`.
- The bundled validator passes for every created or modified operation YAML.
- New facet paths are relative to the operation YAML file.
- The workflow can be resolved unambiguously from its source tree and file path, even if another workflow shares the same visible name.
- Output names, placeholders, and transitions are internally consistent.
- The result preserves runtime-mediated dispatch, same-step return for delegated child tasks, and the canonical completion contract.
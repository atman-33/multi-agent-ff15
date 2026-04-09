---
name: operation-customization
description: 'Create or customize repository operations and facet files. Use when adding or editing builtin or project-authored workflow YAML, jobs, instructions, knowledge, policies, or output-contracts, or when diagnosing operation routing, prompt composition, output placeholders, source-aware operation refs, and debug-preview behavior.'
argument-hint: 'Describe the operation or facet files to create or change, whether the workflow lives under builtins or projects, the target language or project id, and whether you need authoring only or diagnostics too.'
---

# Operation Customization

Create or revise operation workflows for this repository without breaking the runtime-mediated contract.

## When to Use

- Add a new operation under `builtins/<lang>/operations/` or `projects/<project-id>/operations/`
- Extend or refactor an existing operation step flow
- Add or revise `steps[].delegation` for Noctis-owned autonomous flows
- Create or revise `jobs`, `instructions`, `knowledge`, `policies`, or `output-contracts` facets under builtin or project facet trees
- Diagnose operation prompt, routing, report transport, source-aware catalog, or output placeholder failures

## Workflow

1. Confirm the target operation, source tree (`builtins` or `projects/<project-id>`), language or project id, and whether the task includes diagnostics.
2. Read the references that match the task:
   - For canonical YAML rules, runtime contracts, and parser constraints, read [operation-authoring.md](./references/operation-authoring.md).
   - For facet-specific writing guidance, read [facet-authoring.md](./references/facet-authoring.md).
   - For routing, prompt, or placeholder failures, read [operation-diagnostics.md](./references/operation-diagnostics.md).
3. Inspect the closest existing operation and neighboring facet files before drafting.
4. When creating files from scratch, start from the matching templates in `./assets/`. Use the dedicated autonomous delegation template for rules-less Noctis-owned parent steps.
5. Decide what should stay reusable in file-backed facets and what should remain step-local inline content.
6. Edit the operation YAML and the required facet files.
7. Validate step transitions, path resolution, output contracts, placeholders, and any delegated child-task return path.
8. Summarize created or changed files, workflow assumptions, and any unresolved ambiguity.

## Bundled Assets

- Use [operation-template.yaml](assets/operation-template.yaml) for standard routed operations.
- Use [autonomous-delegation-template.yaml](assets/autonomous-delegation-template.yaml) for internal Noctis-owned autonomous flows that keep the parent step open while delegating child tasks.
- Use [job-template.md](assets/facets/job-template.md) for reusable step roles.
- Use [instruction-template.md](assets/facets/instruction-template.md) for file-backed instructions or inline content.
- Use [knowledge-body-template.md](assets/facets/knowledge-body-template.md) when the full knowledge body should be injected.
- Use [knowledge-reference-template.md](assets/facets/knowledge-reference-template.md) when file-based knowledge should expose `name`, `description`, and optional `critical` metadata.
- Use [policy-template.md](assets/facets/policy-template.md) for pass or fail criteria.
- Use [output-contract-report-template.md](assets/facets/output-contract-report-template.md) for markdown report artifacts.
- Use [output-contract-frontmatter-template.md](assets/facets/output-contract-frontmatter-template.md) for machine-readable frontmatter artifacts.

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
- Treat unresolved placeholders, legacy schema fields, and malformed output contracts as blocking.
- When runtime behavior changes, inspect both live-path and debug-preview implications before finishing.
- If the workflow is internal-only, keep the internal operation name out of normal user-facing operation lists.

## Completion Criteria

- Every step has a clear owner, job, instruction, and rules.
- A rules-less step is only used for an explicit Noctis-owned autonomous delegation flow.
- New facet paths are relative to the operation YAML file.
- The workflow can be resolved unambiguously from its source tree and file path, even if another workflow shares the same visible name.
- Output names, placeholders, and transitions are internally consistent.
- The result preserves runtime-mediated dispatch, same-step return for delegated child tasks, and the canonical completion contract.
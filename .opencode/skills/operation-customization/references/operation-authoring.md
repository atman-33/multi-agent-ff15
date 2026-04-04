# Operation Authoring Reference

Read this file when creating or editing `builtins/<lang>/operations/*.yaml` or when changing facet wiring.

## Start From Template

- For a standard routed workflow file, copy [operation-template.yaml](../assets/operation-template.yaml) and then replace placeholders.
- For a rules-less Noctis-owned parent step with `steps[].delegation`, copy [autonomous-delegation-template.yaml](../assets/autonomous-delegation-template.yaml) instead of adapting the generic template.
- Keep comments only while drafting. Remove leftover guidance comments from the final operation file.

## Source Of Truth

- `builtins/<lang>/facets/knowledge/operation-authoring-and-diagnostics.md`
- `builtins/<lang>/facets/knowledge/operation-system-contract.md`
- The target `builtins/<lang>/operations/<name>.yaml`
- Representative neighboring facets in the same category

If runtime behavior may change, also inspect:

- `web/app/lib/operation-definition/operation-loader.ts`
- `web/app/lib/operation-definition/facet-loader.ts`
- `web/app/lib/prompt-composition-engine/operation-prompt-builder.ts`
- Relevant tests under `web/app/lib/operation-definition/` and `web/app/lib/prompt-composition-engine/`

## Canonical Rules

1. Use `initial_step` and `steps`. Do not use `initial_movement`, `movements`, `max_movements`, or `handoff_mode`.
2. `initial_step` must reference an existing `noctis` step and must not route directly to `ABORT` or `COMPLETE`.
3. Every content-bearing field must be a source object with exactly one of `file` or `inline`.
4. Canonical source forms are:
   - `job.file` or `job.inline`
   - `instruction.file` or `instruction.inline`
   - `knowledge[].file` or `knowledge[].inline`
   - `policies[].file` or `policies[].inline`
   - `delegation.worker_job.file` or `delegation.worker_job.inline`
   - `delegation.worker_instruction.file` or `delegation.worker_instruction.inline`
   - `delegation.worker_knowledge[].file` or `delegation.worker_knowledge[].inline`
   - `delegation.worker_policies[].file` or `delegation.worker_policies[].inline`
   - `output_contracts.report[].format.file` or `output_contracts.report[].format.inline`
5. Do not use removed step fields such as `edit`, `pass_previous_response`, `job_file`, `instruction_file`, `knowledge_files`, `policy_files`, or `format_file`.
6. `delegation` is only valid on `noctis` steps and is intended for autonomous parent steps that stay open while delegating child tasks.
7. A step may omit `rules` only for an explicit Noctis-owned autonomous delegation flow.
8. Preserve authored order for `knowledge`, `policies`, `delegation.worker_knowledge`, and `delegation.worker_policies` lists.
9. The runtime owns dispatch. Do not design manual Noctis relay or message-body step tags as the transition mechanism.
10. The canonical completion transport is `taskId + next + message`.
11. `delegation.allowed_workers` is the authored upper bound. Runtime intersects it with the mission allowed worker set to determine the effective child-task targets.
12. Delegated worker prompts are composed from `delegation.worker_*` sources rather than the parent step's job and instruction.
13. Output placeholders must resolve to existing mission-scoped files. Treat unresolved placeholders as blocking failures.
14. Output-contract facets must contain exactly one `## Format` section followed by exactly one `## Rule` section.

## Autonomous Delegation Pattern

- Use the dedicated autonomous delegation template when Noctis should remain in one open-ended parent step.
- Keep the parent step owned by `noctis`.
- Omit `rules` only when child reports should return to the same parent step instead of advancing the workflow.
- Put delegated worker prompt material under `delegation.worker_*` instead of reusing the parent step's prompt facets.
- If the operation is internal-only, hide its operation name from normal user-facing operation lists.

## Authoring Checklist

- Confirm the operation already has the right step ownership model.
- Confirm whether the workflow is a standard routed operation or an autonomous delegation flow before choosing a template.
- Resolve every facet path relative to the operation YAML file.
- Keep reusable content in facet files and step-specific content inline.
- Verify every `next` target exists or is one of `COMPLETE` or `ABORT`.
- Re-check any `output(...)` reference against actual step names and filenames.
# Operation Authoring Reference

Read this file when creating or editing `builtins/<lang>/operations/*.yaml`, `projects/<project-id>/operations/*.yaml`, or when changing facet wiring.

## Start From Template

- For a standard routed workflow file, copy [operation-template.yaml](../assets/operation-template.yaml) and then replace placeholders.
- For a rules-less Noctis-owned parent step with `steps[].delegation`, copy [autonomous-delegation-template.yaml](../assets/autonomous-delegation-template.yaml) instead of adapting the generic template.
- Keep comments only while drafting. Remove leftover guidance comments from the final operation file.

## Source Of Truth

- `builtins/<lang>/facets/skills/operation-authoring-and-diagnostics/SKILL.md`
- `builtins/<lang>/facets/skills/operation-system-contract/SKILL.md`
- The target workflow file under `builtins/<lang>/operations/<name>.yaml` or `projects/<project-id>/operations/<name>.yaml`
- Representative neighboring facets in the same source tree

If runtime behavior may change, also inspect:

- `web/app/lib/operation-definition/operation-catalog.ts`
- `web/app/lib/operation-definition/operation-loader.ts`
- `web/app/lib/operation-definition/facet-loader.ts`
- `web/app/lib/operation-presentation.ts`
- `web/app/lib/operation-debug/operation-options.server.ts`
- `web/app/lib/prompt-composition-engine/operation-prompt-builder.ts`
- Relevant tests under `web/app/lib/operation-definition/` and `web/app/lib/prompt-composition-engine/`

After editing a concrete workflow file, run:

- `node .opencode/skills/operation-customization/scripts/validate-operation-yaml.mjs <path-to-operation.yaml>`

Treat validator failures as blocking before you move on to higher-level runtime checks.

## Canonical Rules

1. Use `initial_step` and `steps`. Do not use `initial_movement`, `movements`, `max_movements`, or `handoff_mode`.
2. `initial_step` must reference an existing `noctis` step and must not route directly to `ABORT` or `COMPLETE`.
   - If the initial step needs a failure or blocked branch, route to a named non-initial step and let that later step choose `ABORT` or `COMPLETE`.
3. Workflow files live under either `builtins/<lang>/operations/*.yaml` or `projects/<project-id>/operations/*.yaml`. The matching reusable facet tree is the sibling `../facets/**` relative to that workflow file.
4. Every content-bearing field must be a source object with exactly one of `file` or `inline`.
5. Canonical source forms are:
   - `job.file` or `job.inline`
   - `instruction.file` or `instruction.inline`
   - `skills[].file`
   - `policies[].file` or `policies[].inline`
   - `delegation.worker_job.file` or `delegation.worker_job.inline`
   - `delegation.worker_instruction.file` or `delegation.worker_instruction.inline`
   - `delegation.worker_skills[].file`
   - `delegation.worker_policies[].file` or `delegation.worker_policies[].inline`
   - `output_contracts.report[].format.file` or `output_contracts.report[].format.inline`
6. `file` sources are resolved relative to the workflow YAML path, not repository root.
7. Same-name builtin and project workflows remain separate catalog entries. Keep the visible `name` only when that duplication is intentional, and use `description` to clarify the source-specific behavior.
8. Do not use removed step fields such as `edit`, `pass_previous_response`, `job_file`, `instruction_file`, `knowledge`, `knowledge_files`, `worker_knowledge`, `policy_files`, or `format_file`.
9. `delegation` is only valid on `noctis` steps and is intended for autonomous parent steps that stay open while delegating child tasks.
10. A step may omit `rules` only for an explicit Noctis-owned autonomous delegation flow.
11. Default to the fewest steps that preserve clear ownership, required artifact boundaries, and explicit approval or input waits.
12. Do not add Noctis relay steps or User-facing progress-update steps between worker steps unless checkpoints, approvals, or interactive monitoring were explicitly requested.
13. User-facing messaging should normally happen only at final completion or when the workflow is blocked and waiting for User input.
14. Preserve authored order for `skills`, `policies`, `delegation.worker_skills`, and `delegation.worker_policies` lists.
15. The runtime owns dispatch. Do not design manual Noctis relay or message-body step tags as the transition mechanism.
16. The canonical workflow identity is a source-aware `operationRef` derived from the workflow source tree and file name. Do not assume plain `name` is globally unique.
17. The canonical completion transport is `taskId + next + message`.
18. `delegation.allowed_workers` is the authored upper bound. Runtime intersects it with the mission allowed worker set to determine the effective child-task targets.
19. Delegated worker prompts are composed from `delegation.worker_*` sources rather than the parent step's job and instruction.
20. Output placeholders must resolve to existing mission-scoped files. Treat unresolved placeholders as blocking failures.
21. Output-contract facets must contain exactly one `## Format` section followed by exactly one `## Rule` section.

## Autonomous Delegation Pattern

- Use the dedicated autonomous delegation template when Noctis should remain in one open-ended parent step.
- Keep the parent step owned by `noctis`.
- Omit `rules` only when child reports should return to the same parent step instead of advancing the workflow.
- Keep the parent step open for internal coordination. Message User only on completion, on a real blocker that needs input, or at explicitly requested checkpoints.
- Put delegated worker prompt material under `delegation.worker_*` instead of reusing the parent step's prompt facets.
- If the operation is internal-only, hide its operation name from normal user-facing operation lists.
- When a project-authored autonomous flow shares a visible name with a builtin workflow, rely on its source-specific description and path rather than renaming refs by hand.

## Authoring Checklist

- Confirm the operation already has the right step ownership model.
- Confirm whether the workflow belongs in the builtin tree or a project authoring tree before copying templates.
- Confirm whether the workflow is a standard routed operation or an autonomous delegation flow before choosing a template.
- Challenge every step. If it does not change owner, produce a required artifact, or wait for explicit User input or approval, merge or remove it.
- Inspect `steps[initial_step].rules[].next` first. None of those transitions may be `ABORT` or `COMPLETE`.
- Run the bundled validator on each concrete workflow file before you finish.
- Resolve every facet path relative to the operation YAML file.
- Keep reusable content in facet files and step-specific content inline.
- Verify every `next` target exists or is one of `COMPLETE` or `ABORT`.
- Re-check any `output(...)` reference against actual step names and filenames.
# Operation Authoring Reference

Read this file when creating or editing `builtins/<lang>/operations/*.yaml` or when changing facet wiring.

## Start From Template

- For a new workflow file, copy [operation-template.yaml](../assets/operation-template.yaml) and then replace placeholders.
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
   - `output_contracts.report[].format.file` or `output_contracts.report[].format.inline`
5. Do not use removed step fields such as `edit`, `pass_previous_response`, `job_file`, `instruction_file`, `knowledge_files`, `policy_files`, or `format_file`.
6. Preserve authored order for `knowledge` and `policies` lists.
7. The runtime owns dispatch. Do not design manual Noctis relay or message-body step tags as the transition mechanism.
8. The canonical completion transport is `taskId + next + message`.
9. Output placeholders must resolve to existing mission-scoped files. Treat unresolved placeholders as blocking failures.
10. Output-contract facets must contain exactly one `## Format` section followed by exactly one `## Rule` section.

## Authoring Checklist

- Confirm the operation already has the right step ownership model.
- Resolve every facet path relative to the operation YAML file.
- Keep reusable content in facet files and step-specific content inline.
- Verify every `next` target exists or is one of `COMPLETE` or `ABORT`.
- Re-check any `output(...)` reference against actual step names and filenames.
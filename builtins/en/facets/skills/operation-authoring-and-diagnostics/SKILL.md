---
name: operation-authoring-and-diagnostics
description: Read this before safely changing operation YAML, project workflow authoring paths, source-aware operationRef handling, facet source resolution, output contracts, output placeholders, or workflow-related tests.
---

# Operation Authoring And Diagnostics

## Purpose

This document organizes the authoring rules and diagnostic viewpoints needed to safely change builtin or project-authored operations and facets in this repository.

Refer to it when changing operation YAML, facet files, output contracts, placeholder behavior, or workflow-related tests.

## Change Surfaces

- Changes to step ownership, rules, or source objects in operation YAML
- Changes to facet file contents or paths
- Changes to output contracts or placeholder references
- Changes that affect the source-aware catalog, operation selector, or operation-debug filter
- Changes that affect the prompt builder, composer, or report routing
- Changes to workflow-related tests

## Runtime-Relevant Authoring Rules

The schema fields you should review most often are:

- `initial_step`
- `steps[]`
- `steps[].job`
- `steps[].instruction`
- `steps[].skills`
- `steps[].policies`
- `steps[].delegation.allowed_workers`
- `steps[].delegation.worker_job`
- `steps[].delegation.worker_instruction`
- `steps[].delegation.worker_skills`
- `steps[].delegation.worker_policies`
- `steps[].output_contracts.report[].format`
- `steps[].rules[]`

The semantic roles of those fields differ as follows:

- `job`: the stable role, responsibility, decision principles, and prohibitions for the step
- `instruction`: the step-specific execution procedure and references
- `skills`: background skills or reference material required to execute the current step
- `policies`: constraints and conventions that the current step must follow
- `delegation.*`: the allowed targets and prompt material used when a Noctis-owned step delegates a child task to a worker
- `output_contracts.report[].format`: the format definition for report artifacts

Canonical source forms are:

- `job.file` / `job.inline`
- `instruction.file` / `instruction.inline`
- `skills[].file`
- `policies[].file` / `policies[].inline`
- `output_contracts.report[].format.file` / `output_contracts.report[].format.inline`

Canonical authored locations and identity are:

- builtin workflow: `builtins/<lang>/operations/*.yaml`
- project workflow: `projects/<project-id>/operations/*.yaml`
- builtin facets: `builtins/<lang>/facets/**`
- project facets: `projects/<project-id>/facets/**`
- canonical identity: `operationRef` (`builtin:<lang>:<fileName>` or `project:<projectId>:<fileName>`)

The following constraints often map directly to runtime failure, so check them early in design:

- `initial_step` should point to a `noctis` step
- List-based facets preserve authored order
- `file` sources resolve relative to the operation YAML path
- Even when same-name workflows exist across builtin and project sources, selector and debug preview must not collapse them
- Auto activation from a message body succeeds only when the catalog match is unambiguous
- Runtime state, the Noctis Team selector, and operation-debug preview use `operationRef` as the canonical key, not plain operation name
- `output_contracts.report[].format` must stay consistent with the output filename and any downstream references
- `steps[].delegation.allowed_workers` is the authored upper bound, while the runtime effective set is the intersection with the mission's allowed worker set
- `rules` may be omitted only for an autonomous delegation step where Noctis remains on the same parent step

Legacy fields such as `initial_movement`, `movements`, `max_movements`, `edit`, `handoff_mode`, `job_file`, and `knowledge_files` are not canonical.

When changing prompts, always inspect both the operation YAML and the referenced facet files together.

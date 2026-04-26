---
name: operation-system-contract
description: Read this when changing runtime-owned dispatch, source-aware operationRef, step-completion transport, prompt composition boundaries, or live versus debug prompt differences.
---

# Operation System Contract

## Purpose

This document organizes the stable runtime and prompt-composition contract of the operation system in this repository.

Refer to it when changing workflow routing, runtime dispatch ownership, report handling, or prompt composition boundaries.

## Non-Negotiable Invariants

- Dispatch is runtime-mediated, not direct agent chaining.
- The runtime decides the next actor and owns worker dispatch.
- The canonical workflow key in runtime state is `operationRef`, and `operationName` is for display only.
- Workflows with the same `name` across builtin and project sources are treated as separate catalog entries.
- Auto activation from a free-form message succeeds only when there is a unique catalog match.
- The canonical transport for step completion is `taskId + next + message`.
- Routing depends on runtime state, not standalone body tags or `[STEP:N]` tokens.
- Noctis steps and worker steps share the same completion contract.
- A delegated child task does not change parent step ownership; after reporting, it returns to the same Noctis-owned step.

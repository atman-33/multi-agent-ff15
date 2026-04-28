---
description: "Create implementation GitHub issues from a PRD issue or raw PRD text, then set parent and blocked-by relationships"
argument-hint: "PRD issue number/URL or PRD text"
agent: "agent"
---

Create implementation GitHub issues from a PRD source.

Use this prompt when the user wants executable implementation issues, not only a proposed breakdown.

**Input**

The argument after this prompt may be:
- A PRD GitHub issue number
- A PRD GitHub issue URL
- Raw PRD text

If the argument is empty, use the current editor selection or recent chat context only when it clearly contains the PRD.

**Goal**

- Resolve the PRD source
- If the PRD is not already a GitHub issue, create a parent PRD issue first
- Use the `prd-to-issues` skill to derive the implementation issue set
- Create the implementation issues immediately
- Set GitHub issue relationships:
  - Parent issue -> the PRD issue
  - Blocked by -> only strict start-blocking dependencies
- Return a concise summary of created issues and relationships

**Steps**

1. Resolve the target repository and PRD source. Ask only if the repository or PRD source is genuinely unclear.
2. If the input is raw PRD text, create a parent PRD issue first and use it as the canonical anchor.
3. Use the `prd-to-issues` skill to generate the implementation issue breakdown and issue bodies. Do not stop for an approval round unless the PRD is ambiguous or contradictory.
4. Create issues in dependency order so blocker issue numbers are available before dependent issues are created.
5. After issue creation, set GitHub issue relationships for each issue:
   - Assign the PRD issue as the parent when applicable
   - Add `blocked by` relationships only for strict dependencies that prevent starting work
   - Do not encode preferred sequencing as dependencies
6. Verify the final graph is internally consistent: every blocked issue points to an existing blocker, and every child issue points to the PRD parent.
7. Respond with:
   - The parent PRD issue
   - The created implementation issues
   - The `blocked by` relationships that were set
   - Any relationships that could not be set programmatically

**Ask Only If Blocked**

- Which repository should receive the issues?
- Is this PRD text final enough to create a parent PRD issue?
- Which ambiguity must be resolved before creating issues?

**Guardrails**

- Do not create implementation issues without a PRD anchor
- Do not ask for a manual breakdown review by default
- Use `blocked by` only for strict start blockers
- Prefer GitHub issue relationships over writing dependency text only in issue bodies
- If relationships cannot be set with the available tools, stop after issue creation and report the exact missing relationships
- Keep the response concise and execution-focused
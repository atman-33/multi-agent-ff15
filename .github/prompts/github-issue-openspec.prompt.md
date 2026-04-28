---
description: Create apply-ready OpenSpec artifacts from a GitHub issue URL
argument-hint: <github-issue-url>
---

Create apply-ready OpenSpec artifacts from a GitHub issue.

**Input**: The argument after `/github-issue-openspec` must be a GitHub issue URL.

**Steps**

1. **If no usable issue URL is provided, ask for it**

   Ask User for the exact GitHub issue URL before proceeding.

2. **Refresh remote state**
   ```bash
   git fetch origin --prune
   ```

3. **Investigate from the latest `origin/main` state**
   - Base the investigation on the current tip of `origin/main`
   - Do not rely on a stale local `main` branch

4. **Read the target GitHub issue and extract the planning input**
   Organize:
   - Goal
   - Acceptance criteria
   - Constraints
   - Related links or references

5. **If a direct parent issue exists, inspect it too**
   - Prefer an explicit GitHub parent relationship when available
   - Otherwise follow only one explicit parent reference from the issue body or template
   - Do not expand into a broad related-issue graph

6. **Derive stable names from the issue intent**
   Create:
   - Change name: `<issue-number>-<change-slug>`
   - Branch name: `feature/<issue-number>-<change-slug>`

7. **Check whether the working tree is safe before switching branches**
   - If there are unrelated local changes, merge conflicts, or another unsafe git state, stop and report the blocker

8. **Create or reuse the feature branch from `origin/main` and switch to it**
   - Reuse an existing matching branch only if it clearly belongs to the same issue and intent

9. **Use the `openspec-ff-change` skill to generate apply-ready artifacts**
   - Use the same change name derived above
   - Keep the branch name and OpenSpec change name aligned
   - Do not restate or inline the skill instructions

10. **Stop after artifact generation and report the result**
    Summarize:
    - Issue summary
    - Parent issue summary, if used
    - Change name
    - Branch name
    - Change path
    - Artifacts created
    - Any unresolved questions or blockers

**Guardrails**

- Respect repository and workspace instructions while generating artifacts
- Prefer momentum, but ask a focused question if the issue content is too ambiguous to derive a reliable change name
- If the issue cannot be accessed, ask User to provide the issue text or a reachable URL
- Do not implement code, open a PR, or continue beyond artifact generation
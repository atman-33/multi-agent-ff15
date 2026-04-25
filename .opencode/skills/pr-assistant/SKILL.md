---
name: pr-assistant
description: Analyzes git changes and assists with creating comprehensive pull requests. Use when user wants to create a PR, review changes before PR, or needs help drafting PR descriptions. Triggers on phrases like 'create PR', 'make a pull request', 'draft PR description', 'what changed in this branch', 'prepare PR'.
---

# PR Assistant

Assists with creating well-structured pull requests by analyzing changes and generating reviewer-friendly PR descriptions.

## Core Philosophy

**Default: human-in-the-loop**. Prepare a draft, show it to the user, and ask for approval before creating the PR.

**Explicit fast-path**. If the user clearly asks you to create the PR immediately, you may generate the draft, run sanity checks, and create the PR without a separate approval turn.

## Workflow

### 1. Analyze Changes

First, gather context about the current branch:

```bash
# Get current branch and target branch
CURRENT_BRANCH=$(git branch --show-current)
TARGET_BRANCH=${TARGET_BRANCH:-main}

# Get diff summary
git diff $TARGET_BRANCH...$CURRENT_BRANCH --stat

# Get commit messages
git log $TARGET_BRANCH...$CURRENT_BRANCH --oneline

# Get detailed changes by category
git diff $TARGET_BRANCH...$CURRENT_BRANCH --name-status
```

Use `scripts/analyze_changes.py` to categorize changes into generic buckets:
- Frontend
- Backend
- Application
- Tests
- Documentation
- Configuration
- CI
- Infrastructure
- Scripts
- Assets
- Data
- Other

When issue references are present, preserve them in three buckets when possible:
- `issue_references`: every detected issue reference
- `closing_issue_references`: issues that should auto-close on merge
- `related_issue_references`: issues that should stay linked without auto-closing

If classification confidence is low, do not force category-based prose in the PR body. Fall back to diff stats and top-level area summaries.

### 2. Determine PR Type

Prefer the branch name first when selecting the template:
- **Feature**: New functionality or enhancements
- **Bugfix**: Bug fixes or corrections
- **Docs**: Documentation updates
- **Refactor**: Code restructuring without behavior change
- **Chore**: Dependencies, config, tooling updates

If the branch name is inconclusive, use commit prefixes and the change mix. Do not switch to a bugfix template just because a feature branch contains a single `fix:` commit.

### 3. Prepare Output Files

Store generated artifacts inside skill-local output storage:

```bash
mkdir -p .opencode/skills/pr-assistant/outputs
BRANCH_SLUG=$(git branch --show-current | sed 's#/#-#g; s#[^A-Za-z0-9._-]#-#g')
STAMP=$(date +%Y%m%d-%H%M%S)
ANALYSIS_FILE=".opencode/skills/pr-assistant/outputs/pr-analysis-${BRANCH_SLUG}-${STAMP}.json"
PR_BODY_FILE=".opencode/skills/pr-assistant/outputs/pr-body-${BRANCH_SLUG}-${STAMP}.md"
```

Always save both the analysis JSON and the generated PR body.

### 4. Generate PR Draft

Use `scripts/generate_pr_body.py` with the appropriate template from `assets/templates/`.

Auto-fill sections:
- **Summary**: Commit themes, capped to a short list
- **Changes breakdown**: Diff stats plus category or top-level area summaries
- **Related issues**: Parse issue references from commit messages and render close-safe refs as `Closes #123` or `Fixes owner/repo#456`; render non-closing refs as `Related to #123`
- **Checklist**: Auto-populate based on change types

Only emit closing keywords when the PR targets the repository default branch. Otherwise, downgrade those references to non-closing `Related to ...` lines.

After auto-generation, edit the body if necessary. Avoid dumping every changed file into the PR body.

### 5. Quality Checks

Run `scripts/quality_checks.sh` to check for:
- Uncommitted changes
- Merge conflicts
- TODO/FIXME comments in changed files
- Missing test files (for significant code changes)
- Large file additions (>1MB)

Run validation commands sequentially when a repository has generated artifacts or known typegen/test interactions. Avoid parallel validation unless the repository is known to support it.

Present warnings to the user but don't block PR creation unless there is a hard failure or the user says otherwise.

### 6. Present Draft or Create Immediately

By default, present the generated PR body in a clear, editable format and explicitly ask the user to review and approve it.

Example presentation:
```
I've prepared a PR draft. Please review the content below and let me know if you'd like any changes:

---
[Generated PR body here]
---

Would you like me to:
1. Create the PR with this content
2. Make edits to the description
3. Change the target branch (currently: main)
4. Add/remove reviewers
```

If the user explicitly requested immediate PR creation, briefly summarize the generated draft and then create the PR.

If the draft contains closing keywords, explicitly call out which issues will auto-close when the PR is merged.

### 7. Create the PR

Once the user approves, or when the user explicitly requested immediate creation, use `gh` CLI:

```bash
gh pr create \
  --title "PR Title" \
  --body-file "$PR_BODY_FILE" \
  --base main \
  --head current-branch \
  [--reviewer user1,user2] \
  [--label label1,label2]
```

Only suggest reviewers or labels when repository conventions are obvious or the user asks.

Preserve any `Closes ...`, `Fixes ...`, or `Resolves ...` lines in the final PR body so GitHub can auto-close the linked issues on merge.

## Generic Classification Strategy

- Use coarse categories that travel well across repositories.
- Prefer confidence-aware output. If the analysis reports low confidence, summarize top-level areas instead of pretending the category split is precise.
- Keep `Other` as an escape hatch instead of overfitting repository-specific path rules.
- When the category split is weak, prefer diff stats plus the major top-level directories that changed.

**Branch naming conventions**:
- `feature/*` → Feature template
- `feat/*` → Feature template
- `bugfix/*` or `fix/*` → Bugfix template
- `hotfix/*` → Bugfix template
- `docs/*` → Docs template
- `refactor/*` → Refactor template
- `chore/*`, `build/*`, `ci/*` → Chore template
- Other → Feature template (default)

## Best Practices

See `references/pr-best-practices.md` for detailed guidelines.

Key points:
- Keep PRs focused (single concern)
- Write clear, descriptive titles
- Explain the "why" not just "what"
- Include testing evidence
- Link to related issues
- Self-review before requesting review
- Prefer concise, reviewer-friendly summaries over exhaustive file inventories

## Interactive Editing

If the user wants to edit the draft:
1. Ask which section to modify
2. Update the specific section
3. Re-present the full draft
4. Repeat until approved

## Common Commands

User might say:
- "Create a PR" → Full workflow
- "What changed?" → Just analysis (step 1)
- "Draft PR description" → Steps 1-3, present draft
- "Update PR description" → Edit existing draft
- "Check if ready for PR" → Run quality checks

## Error Handling

If issues arise:
- No commits ahead of target → Inform user, suggest checking branch
- Merge conflicts → Show conflicts, suggest resolving first
- No GitHub CLI → Inform user, offer to create PR body for manual submission
- API rate limits → Suggest waiting or manual creation

## Output Format

Always save the generated analysis and PR body to skill-local output files for easy editing:

```bash
mkdir -p .opencode/skills/pr-assistant/outputs
BRANCH_SLUG=$(git branch --show-current | sed 's#/#-#g; s#[^A-Za-z0-9._-]#-#g')
STAMP=$(date +%Y%m%d-%H%M%S)
ANALYSIS_FILE=".opencode/skills/pr-assistant/outputs/pr-analysis-${BRANCH_SLUG}-${STAMP}.json"
PR_BODY_FILE=".opencode/skills/pr-assistant/outputs/pr-body-${BRANCH_SLUG}-${STAMP}.md"
```

The local `.gitignore` in `pr-assistant/` should ignore `outputs/` so these artifacts stay out of version control.

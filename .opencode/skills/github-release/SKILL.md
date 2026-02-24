---
name: github-release
description: Automate GitHub release workflows including version management, CHANGELOG updates, PR creation, and GitHub Release publishing for multi-agent-ff15.
---

# GitHub Release Automation

Automate the release process for multi-agent-ff15. The actual GitHub Release (tag + release notes) is created by GitHub Actions after the release branch is merged into main.

## Overview

- **Version Management**: Manage version in `package.json`
- **CHANGELOG Automation**: Generate and update CHANGELOG.md with proper formatting
- **PR Workflow**: Create a release branch, open a PR, merge into main
- **GitHub Actions**: Trigger the "Release" workflow to create the tag and GitHub Release

## Workflow Pattern

### Phase 1: Local Preparation (on `release/vX.Y.Z` branch)

1. **Create release branch** from main:
   ```bash
   git checkout main && git pull
   git checkout -b release/vX.Y.Z
   ```

2. **Bump version** in `package.json`:
   ```bash
   python3 .opencode/skills/github-release/scripts/bump_version.py <major|minor|patch|version>
   ```

3. **Update CHANGELOG.md**:
   ```bash
   python3 .opencode/skills/github-release/scripts/update_changelog.py <create|update> <version> <owner/repo>
   ```
   - Review the scaffold entry — edit TODOs and verify formatting before committing.

4. **Commit and push** to the release branch:
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "chore: release vX.Y.Z"
   git push origin release/vX.Y.Z
   ```

### Phase 2: PR & Merge

5. **Create a PR** (`release/vX.Y.Z` → `main`):
   ```bash
   python3 .opencode/skills/github-release/scripts/create_pr.py release/vX.Y.Z main <version>
   ```
   Or use `gh pr create` directly.

6. **Review and merge** the PR into main. Do NOT merge yourself — wait for approval.

### Phase 3: GitHub Actions Release

7. Go to **GitHub Actions** → **"Release"** workflow → **Run workflow**.
8. Enter the version (e.g. `0.4.1`) and run.
9. The workflow will automatically:
   - Validate `package.json` version matches the input
   - Extract release notes from `CHANGELOG.md`
   - Create and push the git tag `vX.Y.Z`
   - Create the GitHub Release with extracted notes

## Individual Scripts Reference

```bash
# Check version configuration
python3 .opencode/skills/github-release/scripts/check_versions.py

# Bump version
python3 .opencode/skills/github-release/scripts/bump_version.py <major|minor|patch|version>

# Update CHANGELOG
python3 .opencode/skills/github-release/scripts/update_changelog.py <create|update> <version> <owner/repo>

# Create PR (requires gh CLI)
python3 .opencode/skills/github-release/scripts/create_pr.py <from_branch> <to_branch> <version>
```

> **Note**: `create_release.py` is superseded by GitHub Actions. Use the Actions workflow for all GitHub Release creation.

## Mandatory Rules (MUST follow)

1. **NEVER work on main directly** — All version bumps and CHANGELOG updates go on a `release/vX.Y.Z` branch. Direct push to main is prohibited.

2. **ALWAYS review CHANGELOG.md after script update** — Inspect formatting, section headers, blank lines, and link references before committing.

3. **Trigger GitHub Actions AFTER the PR is merged** — The "Release" workflow reads from main, so it must be run only after the release branch is merged.

## Requirements

- Python 3
- GitHub CLI (`gh`) installed and authenticated
- `package.json` in the root (used for version tracking)
- `CHANGELOG.md` with entries in the format `## [X.Y.Z] - YYYY-MM-DD`

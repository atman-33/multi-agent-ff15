---
name: github-release
description: Automate GitHub release workflows including version management, CHANGELOG updates, PR creation, and GitHub Release publishing for multi-agent-ff15.
---

# GitHub Release Automation

Automate the release process for multi-agent-ff15 from version bumping through GitHub Release creation.

## Overview

This skill provides Python scripts for managing releases:

- **Version Management**: Manage version in `package.json`
- **CHANGELOG Automation**: Generate and update CHANGELOG.md with proper formatting
- **GitHub Integration**: Create PRs and Releases using GitHub CLI (gh)
- **Interactive Workflow**: Guided step-by-step release process

## Quick Start

### Interactive Workflow (Recommended)

Run the interactive workflow for guided release:

```bash
python3 .opencode/skills/github-release/scripts/release_workflow.py
```

This will guide you through:
1. Pre-flight checks (git status, current version)
2. Version selection (initial or bump type)
3. CHANGELOG generation/update
4. Git commit and push
5. PR Creation (optional)
6. Release Creation (optional)

### Individual Commands

Use individual scripts for specific tasks:

```bash
# Check version configuration
python3 .opencode/skills/github-release/scripts/check_versions.py

# Bump version
python3 .opencode/skills/github-release/scripts/bump_version.py <major|minor|patch|version>

# Update CHANGELOG
python3 .opencode/skills/github-release/scripts/update_changelog.py <create|update> <version> <owner/repo>

# Create PR (requires gh CLI)
python3 .opencode/skills/github-release/scripts/create_pr.py <from_branch> <to_branch> <version>

# Create GitHub Release (requires gh CLI)
python3 .opencode/skills/github-release/scripts/create_release.py <version> [--publish]
```

## Mandatory Rules (MUST follow)

1. **NEVER work on main/master branch directly**
   - The workflow script automatically detects if you are on `main`/`master` and creates a release branch
   - All commits and pushes go to the release branch ONLY
   - A PR is always required to merge into main

2. **ALWAYS review CHANGELOG.md after script update**
   - The script inserts a scaffold entry — inspect formatting before committing
   - Confirm section headers, blank lines, and link references look correct

## Workflow Pattern

1. **Run Workflow**: Start the interactive script. If on `main`/`master`, it will automatically create `release/vX.Y.Z` branch.
2. **Version Bump**: Select release type (patch/minor/major/custom).
3. **Review CHANGELOG.md**: Script inserts scaffold entry. Edit TODOs and verify formatting.
4. **Commit**: Script commits `package.json` and `CHANGELOG.md` to the release branch.
5. **Push**: Push the release branch to remote.
6. **PR**: Create a PR (`release/vX.Y.Z` → `main`). Do NOT merge yourself.
7. **Release**: Create a GitHub Release tagged `vX.Y.Z` after PR is merged.

## Requirements

- Python 3
- GitHub CLI (`gh`) installed and authenticated
- `package.json` in the root (will be employed for version tracking)

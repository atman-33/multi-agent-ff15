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

## Workflow Pattern

1. **Run Workflow**: Start the interactive script to handle versioning and changelog.
2. **Review**: Check the generated CHANGELOG.md and `package.json`.
3. **Commit**: The script commits changes with a standardized message.
4. **Push**: Push changes to remote.
5. **PR**: Create a PR to merge release changes to main.
6. **Release**: Create a GitHub release tagged with `vX.Y.Z`.

## Requirements

- Python 3
- GitHub CLI (`gh`) installed and authenticated
- `package.json` in the root (will be employed for version tracking)

#!/usr/bin/env python3
"""
Create or update CHANGELOG.md for releases
"""

import sys
from pathlib import Path
from datetime import datetime


INITIAL_TEMPLATE = """# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [{version}] - {date}

### Added
- TODO: List new features and capabilities

### Changed
- TODO: List changes to existing functionality

### Fixed
- TODO: List bug fixes

### Security
- TODO: List security improvements (if any)

[{version}]: https://github.com/{repo}/releases/tag/v{version}
"""

UPDATE_TEMPLATE = """
## [{version}] - {date}

### Added
- TODO: List new features and capabilities

### Changed
- TODO: List changes to existing functionality

### Fixed
- TODO: List bug fixes

### Deprecated
- TODO: List deprecated features (if any)

### Removed
- TODO: List removed features (if any)

### Security
- TODO: List security improvements (if any)
"""


def create_initial_changelog(
    project_root: Path, version: str, repo: str
) -> tuple[bool, list[str]]:
    messages = []
    changelog_path = project_root / "CHANGELOG.md"

    if changelog_path.exists():
        messages.append("❌ CHANGELOG.md already exists. Use update mode instead.")
        return False, messages

    content = INITIAL_TEMPLATE.format(
        version=version, date=datetime.now().strftime("%Y-%m-%d"), repo=repo
    )

    with open(changelog_path, "w") as f:
        f.write(content)

    messages.append(f"✅ Created CHANGELOG.md with version {version}")
    messages.append("⚠️  Please edit CHANGELOG.md to fill in the TODO sections")
    return True, messages


def update_changelog(
    project_root: Path, version: str, repo: str
) -> tuple[bool, list[str]]:
    messages = []
    changelog_path = project_root / "CHANGELOG.md"

    if not changelog_path.exists():
        messages.append("❌ CHANGELOG.md not found. Use create mode instead.")
        return False, messages

    with open(changelog_path) as f:
        content = f.read()

    prev_version = None
    for line in content.split("\n"):
        if line.startswith("## [") and "]" in line:
            start = line.index("[") + 1
            end = line.index("]")
            prev_version = line[start:end]
            break

    if not prev_version:
        messages.append("⚠️  Could not detect previous version from CHANGELOG.md")
        prev_version = "0.0.0"

    new_entry = UPDATE_TEMPLATE.format(
        version=version,
        date=datetime.now().strftime("%Y-%m-%d"),
    )

    lines = content.split("\n")
    insert_index = -1

    for i, line in enumerate(lines):
        if line.startswith("## [") or line.startswith("## Unreleased"):
            insert_index = i
            break
        elif line.startswith("# ") and i > 0:
            insert_index = i + 2
            break

    if insert_index == -1:
        insert_index = len(lines)

    entry_lines = new_entry.strip("\n").split("\n")
    lines = lines[:insert_index] + [""] + entry_lines + [""] + lines[insert_index:]

    new_link = (
        f"[{version}]: https://github.com/{repo}/compare/v{prev_version}...v{version}"
    )
    link_pattern = f"[{prev_version}]: https://github.com/{repo}"
    inserted_link = False
    for i, line in enumerate(lines):
        if line.startswith(f"[{prev_version}]:") and link_pattern in line:
            lines.insert(i, new_link)
            inserted_link = True
            break

    if not inserted_link:
        lines.append(new_link)

    with open(changelog_path, "w") as f:
        f.write("\n".join(lines))

    messages.append(f"✅ Updated CHANGELOG.md with version {version}")
    messages.append("⚠️  Please edit CHANGELOG.md to fill in the TODO sections")
    return True, messages


def main():
    if len(sys.argv) < 4:
        print(
            "Usage: update_changelog.py <create|update> <version> <repo> [project_root]"
        )
        sys.exit(1)

    mode = sys.argv[1]
    version = sys.argv[2]
    repo = sys.argv[3]
    project_root = Path(sys.argv[4]) if len(sys.argv) > 4 else Path.cwd()

    if mode not in ["create", "update"]:
        print(f"❌ Invalid mode: {mode}. Use 'create' or 'update'")
        sys.exit(1)

    if mode == "create":
        success, messages = create_initial_changelog(project_root, version, repo)
    else:
        success, messages = update_changelog(project_root, version, repo)

    for msg in messages:
        print(msg)

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

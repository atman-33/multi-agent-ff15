#!/usr/bin/env python3
"""
Bump version in package.json
"""

import json
import sys
from pathlib import Path


def parse_version(version: str) -> tuple[int, int, int]:
    """Parse version string into (major, minor, patch)"""
    parts = version.split(".")
    if len(parts) != 3:
        raise ValueError(f"Invalid version format: {version}")
    return tuple(map(int, parts))


def bump_version(version: str, bump_type: str) -> str:
    """
    Bump version based on type.
    
    Args:
        version: Current version (e.g., "1.0.0")
        bump_type: One of "major", "minor", "patch"
    
    Returns:
        New version string
    """
    major, minor, patch = parse_version(version)
    
    if bump_type == "major":
        return f"{major + 1}.0.0"
    elif bump_type == "minor":
        return f"{major}.{minor + 1}.0"
    elif bump_type == "patch":
        return f"{major}.{minor}.{patch + 1}"
    else:
        raise ValueError(f"Invalid bump type: {bump_type}. Use major, minor, or patch")


def update_versions(project_root: Path, new_version: str) -> tuple[bool, list[str]]:
    """
    Update version in package.json.
    
    Returns:
        (success, messages): tuple of success status and list of messages
    """
    messages = []
    
    # Update package.json
    package_path = project_root / "package.json"
    if not package_path.exists():
        messages.append("❌ package.json not found")
        return False, messages
    
    with open(package_path, "r") as f:
        package = json.load(f)
    
    old_version = package.get("version", "0.0.0")
    package["version"] = new_version
    
    with open(package_path, "w") as f:
        json.dump(package, f, indent=2)
        f.write("\n")
    
    messages.append(f"✓ Updated package.json: {old_version} -> {new_version}")
    
    messages.append(f"\n✅ Version bumped successfully to {new_version}")
    return True, messages


def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: bump_version.py <major|minor|patch|version> [project_root]")
        print("\nExamples:")
        print("  bump_version.py patch")
        print("  bump_version.py minor")
        print("  bump_version.py 1.2.3")
        sys.exit(1)
    
    bump_type = sys.argv[1]
    project_root = Path(sys.argv[2]) if len(sys.argv) > 2 else Path.cwd()
    
    # Read current version
    package_path = project_root / "package.json"
    if not package_path.exists():
        print("❌ package.json not found")
        sys.exit(1)
    
    with open(package_path, "r") as f:
        package = json.load(f)
        current_version = package.get("version", "0.0.0")
    
    if not current_version:
        print("⚠️  version not found in package.json, defaulting to 0.0.0")
        current_version = "0.0.0"
    
    # Determine new version
    if bump_type in ["major", "minor", "patch"]:
        new_version = bump_version(current_version, bump_type)
    else:
        # Assume it's a specific version number
        new_version = bump_type
        # Validate format
        try:
            parse_version(new_version)
        except ValueError as e:
            print(f"❌ {e}")
            sys.exit(1)
    
    print(f"Current version: {current_version}")
    print(f"New version: {new_version}")
    print()
    
    success, messages = update_versions(project_root, new_version)
    
    for msg in messages:
        print(msg)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Check version consistency in package.json
"""

import json
import sys
from pathlib import Path


def check_versions(project_root: Path, init: bool = False) -> tuple[bool, list[str]]:
    """
    Check if package.json has a version field.
    
    Args:
        project_root: Project root directory
        init: If True, initialize version to 0.0.0 if missing
    
    Returns:
        (success, messages): tuple of success status and list of messages
    """
    messages = []
    
    package_path = project_root / "package.json"
    if not package_path.exists():
        messages.append("❌ package.json not found")
        return False, messages
    
    with open(package_path, "r") as f:
        try:
            package = json.load(f)
        except json.JSONDecodeError:
            messages.append("❌ package.json is invalid JSON")
            return False, messages
    
    version = package.get("version")
    
    if not version:
        if init:
            package["version"] = "0.0.0"
            with open(package_path, "w") as f:
                json.dump(package, f, indent=2)
                f.write("\n")
            messages.append("✅ initialized version to 0.0.0 in package.json")
            return True, messages
        else:
            messages.append("❌ version not found in package.json")
            messages.append("   (use --init to add version: \"0.0.0\")")
            return False, messages
    
    messages.append(f"✓ Found version: {version}")
    return True, messages


def main():
    """Main entry point"""
    project_root = Path.cwd()
    init = "--init" in sys.argv
    
    # Allow passing project root as argument (generic)
    for arg in sys.argv[1:]:
        if not arg.startswith("--"):
            project_root = Path(arg)
            break
            
    success, messages = check_versions(project_root, init)
    
    for msg in messages:
        print(msg)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Create GitHub Release using GitHub CLI (gh)
"""

import subprocess
import sys
from pathlib import Path


def check_gh_cli() -> bool:
    """Check if GitHub CLI is installed and authenticated"""
    try:
        result = subprocess.run(
            ["gh", "auth", "status"],
            capture_output=True,
            text=True
        )
        return result.returncode == 0
    except FileNotFoundError:
        return False


def read_changelog_section(changelog_path: Path, version: str) -> str:
    """Extract changelog section for specific version"""
    if not changelog_path.exists():
        return ""
    
    with open(changelog_path) as f:
        lines = f.readlines()
    
    section_lines = []
    in_section = False
    
    # Try with and without v prefix in changelog headers
    target_header = f"## [{version}]"
    
    for line in lines:
        # Start of our version section
        if target_header in line:
            in_section = True
            continue
        
        # Start of next section (stop)
        if in_section and line.startswith("## ["):
            break
        
        # Collect section content
        if in_section:
            section_lines.append(line)
    
    return "".join(section_lines).strip()


def create_release(
    project_root: Path,
    version: str,
    draft: bool = True
) -> tuple[bool, str]:
    """
    Create GitHub Release.
    """
    
    # Generate release notes
    changelog_path = project_root / "CHANGELOG.md"
    changelog_notes = read_changelog_section(changelog_path, version)
    
    tag_name = f"v{version}"
    
    if changelog_notes:
        notes = f"""# Release {tag_name}

{changelog_notes}
"""
    else:
        notes = f"""# Release {tag_name}

See full changelog at CHANGELOG.md
"""
    
    # Build gh release create command
    cmd = [
        "gh", "release", "create",
        tag_name, 
        "--title", tag_name,
        "--notes", notes
    ]
    
    if draft:
        cmd.append("--draft")
    
    try:
        result = subprocess.run(
            cmd,
            cwd=project_root,
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            return True, result.stdout.strip()
        else:
            return False, result.stderr.strip()
    
    except Exception as e:
        return False, str(e)


def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: create_release.py <version> [--publish] [project_root]")
        sys.exit(1)
    
    version = sys.argv[1]
    publish = "--publish" in sys.argv
    
    project_root = Path.cwd()
    for arg in sys.argv[2:]:
        if not arg.startswith("--"):
            project_root = Path(arg)
            break
    
    # Check gh CLI
    if not check_gh_cli():
        print("❌ GitHub CLI (gh) is not installed or not authenticated")
        sys.exit(1)
    
    # Create release
    draft_str = "draft " if not publish else ""
    print(f"Creating {draft_str}release with tag: v{version}")
    
    success, message = create_release(project_root, version, draft=not publish)
    
    if success:
        print(f"✅ Release {draft_str}created successfully")
        print(message)
    else:
        print(f"❌ Failed to create release")
        print(message)
        sys.exit(1)


if __name__ == "__main__":
    main()

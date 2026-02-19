#!/usr/bin/env python3
"""
Interactive release workflow for multi-agent-ff15
"""

import json
import subprocess
import sys
from pathlib import Path


def run_script(script_name: str, args: list[str], project_root: Path) -> bool:
    """Run a Python script from the scripts directory"""
    script_path = Path(__file__).parent / script_name
    cmd = [sys.executable, str(script_path)] + args

    try:
        result = subprocess.run(cmd, cwd=project_root)
        return result.returncode == 0
    except Exception as e:
        print(f"❌ Error running {script_name}: {e}")
        return False


def check_git_status(project_root: Path) -> tuple[bool, str]:
    """Check if git repository is clean"""
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=project_root,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            return False, "Git command failed"

        if result.stdout.strip():
            return False, "Working directory has uncommitted changes"

        return True, "Clean"
    except FileNotFoundError:
        return False, "Git not found"


def get_current_branch(project_root: Path) -> str:
    """Get current git branch name"""
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=project_root,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()
    except:
        return "unknown"


def get_repo_info(project_root: Path) -> tuple[str | None, str | None]:
    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            cwd=project_root,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            return None, None

        url = result.stdout.strip()

        if url.endswith(".git"):
            url = url[:-4]

        if "github.com" in url:
            parts = url.split("github.com")[-1].strip(":/").split("/")
            if len(parts) >= 2:
                return parts[0], parts[1]

        return None, None
    except:
        return None, None


def prompt_yes_no(question: str, default: bool = True) -> bool:
    """Prompt user for yes/no answer"""
    default_str = "Y/n" if default else "y/N"
    response = input(f"{question} [{default_str}]: ").strip().lower()

    if not response:
        return default

    return response in ["y", "yes"]


def predict_version(current_version: str, bump_type: str) -> str:
    try:
        parts = current_version.split(".")
        major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])
        if bump_type == "patch":
            return f"{major}.{minor}.{patch + 1}"
        elif bump_type == "minor":
            return f"{major}.{minor + 1}.0"
        elif bump_type == "major":
            return f"{major + 1}.0.0"
        else:
            return bump_type
    except Exception:
        return bump_type


def create_release_branch(project_root: Path, version: str) -> tuple[bool, str]:
    branch_name = f"release/v{version}"
    try:
        result = subprocess.run(
            ["git", "checkout", "-b", branch_name],
            cwd=project_root,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            return False, result.stderr.strip()
        return True, branch_name
    except Exception as e:
        return False, str(e)


def main():
    print("=" * 60)
    print("GitHub Release Workflow")
    print("=" * 60)
    print()

    project_root = Path.cwd()

    # 1. Pre-flight Checks
    print("Phase 1: Pre-flight Checks")
    print("-" * 60)

    # Check git status
    clean, msg = check_git_status(project_root)
    if not clean:
        print(f"⚠️  Git status: {msg}")
        if not prompt_yes_no("Continue anyway?", default=False):
            sys.exit(1)
    else:
        print(f"✓ Git status: {msg}")

    # Show current branch
    current_branch = get_current_branch(project_root)
    print(f"✓ Current branch: {current_branch}")

    # Get repo info
    owner, repo_name = get_repo_info(project_root)
    if owner and repo_name:
        repo_full = f"{owner}/{repo_name}"
        print(f"✓ Repository: {repo_full}")
    else:
        repo_full = input("Enter repository (owner/repo): ").strip()

    print()

    # Check current version
    package_path = project_root / "package.json"
    current_version = "0.0.0"
    if package_path.exists():
        try:
            with open(package_path) as f:
                package = json.load(f)
                current_version = package.get("version", "0.0.0")
        except Exception:
            pass

    print(f"Current version: {current_version}")
    print()

    # 2. Version Selection
    print("Phase 2: Version Selection")
    print("-" * 60)

    print("Select release type:")
    print("  1. Patch (bug fixes)")
    print("  2. Minor (new features)")
    print("  3. Major (breaking changes)")
    print("  4. Custom version")
    print()

    bump_choice = input("Enter choice [1-4]: ").strip()

    if bump_choice == "1":
        bump_type = "patch"
    elif bump_choice == "2":
        bump_type = "minor"
    elif bump_choice == "3":
        bump_type = "major"
    elif bump_choice == "4":
        bump_type = input("Enter custom version: ").strip()
    else:
        print("❌ Invalid choice")
        sys.exit(1)

    predicted_version = predict_version(current_version, bump_type)
    print(f"→ New version will be: {predicted_version}")
    print()
    if not prompt_yes_no("Proceed with version bump?"):
        sys.exit(0)

    # 2b. Release Branch Guard (runs after version is known, before any file edits)
    if current_branch in ("main", "master"):
        print()
        print(
            f"⚠️  You are on '{current_branch}'. Direct commits to this branch are not allowed."
        )
        print(f"   A release branch 'release/v{predicted_version}' will be created.")
        if not prompt_yes_no(
            f"Create and switch to 'release/v{predicted_version}'?", default=True
        ):
            print("❌ Aborted. Please switch to a release branch manually and re-run.")
            sys.exit(1)
        ok, result = create_release_branch(project_root, predicted_version)
        if not ok:
            print(f"❌ Failed to create release branch: {result}")
            sys.exit(1)
        current_branch = result
        print(f"✓ Switched to branch '{current_branch}'")
        print()

    # 3. Execution
    print()
    print("Phase 3: Execution")
    print("-" * 60)

    # Bump version
    print("Updating version...")
    if not run_script("bump_version.py", [bump_type, str(project_root)], project_root):
        print("❌ Version bump failed")
        sys.exit(1)

    # Read the NEW version to use in changelog
    with open(package_path) as f:
        package = json.load(f)
        new_version = package.get("version")

    print()

    # Update CHANGELOG
    print("Updating CHANGELOG...")
    changelog_mode = "update"
    if not (project_root / "CHANGELOG.md").exists():
        changelog_mode = "create"
        print("Creating initial CHANGELOG.md...")

    if not run_script(
        "update_changelog.py",
        [changelog_mode, new_version, repo_full, str(project_root)],
        project_root,
    ):
        print("⚠️  CHANGELOG update failed")

    print()
    print("⚠️  CHANGELOG.md has been updated with a scaffold entry.")
    print("   Please open CHANGELOG.md, fill in the TODO sections,")
    print("   and verify the formatting (blank lines, section headers, links).")
    input("   Press Enter when done reviewing CHANGELOG.md...")
    print()

    # 4. Git Operations
    print("Phase 4: Git Operations")
    print("-" * 60)

    # Stage
    print("Staging changes...")
    subprocess.run(["git", "add", "package.json", "CHANGELOG.md"], cwd=project_root)

    # Commit
    commit_msg = f"chore: release v{new_version}"
    print(f"Committing: {commit_msg}")
    if prompt_yes_no("Commit changes?"):
        subprocess.run(["git", "commit", "-m", commit_msg], cwd=project_root)

    # Push
    if prompt_yes_no(f"Push branch '{current_branch}' to remote?"):
        subprocess.run(
            ["git", "push", "-u", "origin", current_branch], cwd=project_root
        )

        # 5. GitHub Integration
        print()
        print("Phase 5: GitHub Integration")
        print("-" * 60)

        if current_branch not in ("main", "master"):
            if prompt_yes_no(f"Create PR ({current_branch} -> main)?"):
                run_script(
                    "create_pr.py",
                    [current_branch, "main", new_version, str(project_root)],
                    project_root,
                )
        else:
            print("⚠️  Skipping PR creation: already on main/master branch.")

        # Release
        if prompt_yes_no(f"Create GitHub Release (v{new_version})?"):
            flags = []
            if prompt_yes_no("Publish immediately (no draft)?", default=False):
                flags.append("--publish")
            run_script(
                "create_release.py",
                [new_version, str(project_root)] + flags,
                project_root,
            )

    print()
    print("✅ Workflow complete!")


if __name__ == "__main__":
    main()

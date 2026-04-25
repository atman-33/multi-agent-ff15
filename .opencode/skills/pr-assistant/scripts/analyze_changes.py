#!/usr/bin/env python3
"""
Analyze git changes and categorize them for PR creation.

Usage:
    python analyze_changes.py [target_branch] [--output OUTPUT]

Output: JSON with categorized changes, confidence metadata, and summary statistics
"""

import argparse
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path, PurePosixPath
from typing import Dict, List, Tuple


DOC_EXTENSIONS = {".md", ".mdx", ".rst", ".txt"}
DOC_BASENAMES = {
    "README",
    "README.md",
    "README.mdx",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "LICENSE",
    "LICENSE.md",
}
FRONTEND_EXTENSIONS = {".tsx", ".jsx", ".css", ".scss", ".sass", ".less", ".html", ".vue", ".svelte"}
BACKEND_EXTENSIONS = {".py", ".rb", ".go", ".rs", ".java", ".kt", ".cs", ".php", ".scala"}
SCRIPT_EXTENSIONS = {".sh", ".bash", ".zsh", ".ps1"}
CONFIG_EXTENSIONS = {".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".properties"}
ASSET_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".bmp", ".avif", ".ttf", ".otf", ".woff", ".woff2"}
DATA_EXTENSIONS = {".sql", ".csv", ".tsv", ".parquet", ".jsonl"}
SOURCE_EXTENSIONS = {".ts", ".js", ".mjs", ".cjs"}
CI_PATH_PREFIXES = (".github/workflows/", ".circleci/", ".buildkite/")
CI_FILENAMES = {"Jenkinsfile", ".gitlab-ci.yml", "azure-pipelines.yml", "azure-pipelines.yaml"}
INFRA_MARKERS = {"terraform", "infra", "infrastructure", "helm", "charts", "k8s", "kubernetes", "ansible"}
FRONTEND_MARKERS = {"web", "ui", "frontend", "client"}
BACKEND_MARKERS = {"api", "apis", "server", "backend", "worker", "workers"}
TEST_MARKERS = {"test", "tests", "spec", "specs", "__tests__", "__snapshots__"}
ISSUE_REF_PATTERN = re.compile(r'(?P<ref>(?:[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)?#\d+)')
CLOSING_CLAUSE_PATTERN = re.compile(
    r'(?i)\b(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\b\s*:?\s+([^\n.;]+)'
)
CONVENTIONAL_COMMIT_PREFIX_PATTERN = re.compile(
    r'^(feat|fix|docs|refactor|chore|build|ci|test)(\(.+?\))?!?:\s*',
    re.IGNORECASE,
)


def run_command(cmd: List[str]) -> Tuple[str, int]:
    """Run a shell command and return output and return code."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False
        )
        return result.stdout.strip(), result.returncode
    except Exception as e:
        return f"Error: {str(e)}", 1


def get_current_branch() -> str:
    """Get the current git branch name."""
    output, _ = run_command(['git', 'branch', '--show-current'])
    return output


def sanitize_branch_name(branch_name: str) -> str:
    """Return a filesystem-safe branch slug."""
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", branch_name.replace("/", "-"))
    return slug.strip("-") or "head"


def normalize_branch_name(branch_name: str) -> str:
    """Normalize local and remote branch names for comparisons."""
    normalized = branch_name.strip()
    prefixes = ('refs/heads/', 'refs/remotes/origin/', 'origin/')
    for prefix in prefixes:
        if normalized.startswith(prefix):
            return normalized[len(prefix):]
    return normalized


def get_default_branch() -> str:
    """Return the repository default branch name when available."""
    output, returncode = run_command(['git', 'symbolic-ref', 'refs/remotes/origin/HEAD'])
    if returncode == 0 and output:
        return normalize_branch_name(output)

    output, returncode = run_command(['git', 'remote', 'show', 'origin'])
    if returncode != 0 or not output:
        return ''

    match = re.search(r'HEAD branch:\s*(?P<branch>.+)$', output, re.MULTILINE)
    return match.group('branch').strip() if match else ''


def get_changed_files(target_branch: str) -> List[Tuple[str, str]]:
    """
    Get list of changed files with their status.
    Returns: [(status, filepath), ...]
    Status: A (added), M (modified), D (deleted), R (renamed)
    """
    output, returncode = run_command([
        'git', 'diff', '--name-status', f'{target_branch}...HEAD'
    ])

    if returncode != 0 or not output:
        return []

    changes = []
    for line in output.split('\n'):
        if not line.strip():
            continue
        parts = line.split('\t', 1)
        if len(parts) == 2:
            status = parts[0][0]  # First character (A, M, D, R)
            filepath = parts[1]
            changes.append((status, filepath))

    return changes


def categorize_file(filepath: str) -> str:
    """Categorize a file using generic, repository-agnostic heuristics."""
    path = PurePosixPath(filepath)
    suffix = path.suffix.lower()
    basename = path.name
    lowered = filepath.lower()
    parts = {part.lower() for part in path.parts}

    if parts & TEST_MARKERS or re.search(r"(^|[._-])(test|spec)([._-]|$)", basename.lower()):
        return 'tests'

    if basename in DOC_BASENAMES or suffix in DOC_EXTENSIONS or 'docs' in parts or 'doc' in parts:
        return 'docs'

    if lowered.startswith(CI_PATH_PREFIXES) or basename in CI_FILENAMES:
        return 'ci'

    if basename == 'Dockerfile' or 'docker-compose' in basename.lower() or parts & INFRA_MARKERS:
        return 'infrastructure'

    if (path.parts and path.parts[0] == 'scripts') or suffix in SCRIPT_EXTENSIONS:
        return 'scripts'

    if basename.startswith('.') and suffix not in DOC_EXTENSIONS:
        return 'config'

    if basename in {'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'} or suffix in CONFIG_EXTENSIONS:
        return 'config'

    if suffix in ASSET_EXTENSIONS or parts & {'assets', 'images', 'img', 'media', 'static', 'public'}:
        return 'assets'

    if suffix in DATA_EXTENSIONS or parts & {'data', 'fixtures', 'migrations', 'seeds'}:
        return 'data'

    if suffix in FRONTEND_EXTENSIONS:
        return 'frontend'

    if suffix in BACKEND_EXTENSIONS:
        return 'backend'

    if suffix in SOURCE_EXTENSIONS:
        if parts & FRONTEND_MARKERS:
            return 'frontend'
        if parts & BACKEND_MARKERS:
            return 'backend'
        return 'application'

    return 'other'


def get_commit_messages(target_branch: str) -> List[str]:
    """Get commit messages between target branch and HEAD."""
    output, returncode = run_command([
        'git', 'log', f'{target_branch}..HEAD', '--oneline'
    ])

    if returncode != 0 or not output:
        return []

    return [line.strip() for line in output.split('\n') if line.strip()]


def get_commit_message_bodies(target_branch: str) -> List[str]:
    """Get full commit messages between target branch and HEAD."""
    output, returncode = run_command([
        'git', 'log', f'{target_branch}..HEAD', '--format=%B%x00'
    ])

    if returncode != 0 or not output:
        return []

    return [entry.strip() for entry in output.split('\x00') if entry.strip()]


def unique_in_order(values: List[str]) -> List[str]:
    """Return unique values while preserving discovery order."""
    seen = set()
    result: List[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def strip_conventional_commit_prefix(message: str) -> str:
    """Remove a conventional commit prefix before issue parsing."""
    return CONVENTIONAL_COMMIT_PREFIX_PATTERN.sub('', message, count=1)


def extract_issue_references(messages: List[str]) -> Dict[str, List[str]]:
    """Extract related and auto-closing issue references from commit messages."""
    all_refs: List[str] = []
    closing_refs: List[str] = []

    for message in messages:
        normalized_message = strip_conventional_commit_prefix(message)
        all_refs.extend(match.group('ref') for match in ISSUE_REF_PATTERN.finditer(normalized_message))

        for clause in CLOSING_CLAUSE_PATTERN.finditer(normalized_message):
            closing_refs.extend(match.group('ref') for match in ISSUE_REF_PATTERN.finditer(clause.group(1)))

    all_refs = unique_in_order(all_refs)
    all_ref_set = set(all_refs)
    closing_refs = [ref for ref in unique_in_order(closing_refs) if ref in all_ref_set]
    closing_ref_set = set(closing_refs)
    related_refs = [ref for ref in all_refs if ref not in closing_ref_set]

    return {
        'all': all_refs,
        'closing': closing_refs,
        'related': related_refs,
    }


def get_diff_stats(target_branch: str) -> Dict[str, int]:
    """Get diff statistics (insertions, deletions)."""
    output, returncode = run_command([
        'git', 'diff', '--shortstat', f'{target_branch}...HEAD'
    ])

    if returncode != 0 or not output:
        return {'files': 0, 'insertions': 0, 'deletions': 0}

    import re
    stats = {'files': 0, 'insertions': 0, 'deletions': 0}

    # Parse: "3 files changed, 123 insertions(+), 45 deletions(-)"
    files_match = re.search(r'(\d+) files? changed', output)
    insertions_match = re.search(r'(\d+) insertions?', output)
    deletions_match = re.search(r'(\d+) deletions?', output)

    if files_match:
        stats['files'] = int(files_match.group(1))
    if insertions_match:
        stats['insertions'] = int(insertions_match.group(1))
    if deletions_match:
        stats['deletions'] = int(deletions_match.group(1))

    return stats


def summarize_categories(changes_by_category: Dict[str, List[Dict[str, str]]]) -> List[Dict[str, object]]:
    """Return compact category summaries with sample files."""
    summaries: List[Dict[str, object]] = []
    for category, files in changes_by_category.items():
        samples = [file_info['file'] for file_info in files[:3]]
        statuses = Counter(file_info['status'] for file_info in files)
        summaries.append({
            'category': category,
            'file_count': len(files),
            'samples': samples,
            'statuses': dict(sorted(statuses.items())),
        })

    summaries.sort(key=lambda item: (-int(item['file_count']), str(item['category'])))
    return summaries


def summarize_top_level_areas(changed_files: List[Tuple[str, str]]) -> List[Dict[str, object]]:
    """Summarize changed files by top-level area."""
    area_counts: Counter[str] = Counter()
    area_samples: Dict[str, List[str]] = defaultdict(list)

    for _, filepath in changed_files:
        parts = filepath.split('/', 1)
        area = parts[0] if len(parts) > 1 else '(repo root)'
        area_counts[area] += 1
        if len(area_samples[area]) < 3:
            area_samples[area].append(filepath)

    summaries = [
        {
            'area': area,
            'file_count': count,
            'samples': area_samples[area],
        }
        for area, count in area_counts.items()
    ]
    summaries.sort(key=lambda item: (-int(item['file_count']), str(item['area'])))
    return summaries


def measure_classification_confidence(changes_by_category: Dict[str, List[Dict[str, str]]], total_files: int) -> Dict[str, object]:
    """Estimate whether the generic category split is trustworthy enough to show directly."""
    other_files = len(changes_by_category.get('other', []))
    coverage = 1.0 if total_files == 0 else (total_files - other_files) / total_files

    if coverage >= 0.85:
        confidence = 'high'
    elif coverage >= 0.6:
        confidence = 'medium'
    else:
        confidence = 'low'

    return {
        'strategy': 'generic',
        'confidence': confidence,
        'matched_files': total_files - other_files,
        'other_files': other_files,
        'coverage': round(coverage, 3),
    }


def extract_commit_subject(commit_line: str) -> str:
    """Return the commit subject from a `git log --oneline` entry."""
    parts = commit_line.split(' ', 1)
    return parts[1] if len(parts) > 1 else commit_line


def infer_pr_type(current_branch: str, changes_by_category: Dict[str, List[Dict[str, str]]], commit_messages: List[str]) -> str:
    """Infer PR type from branch, changes, and commits."""
    branch_prefix = current_branch.lower().split('/', 1)[0]
    branch_type_map = {
        'feature': 'feature',
        'feat': 'feature',
        'bugfix': 'bugfix',
        'fix': 'bugfix',
        'hotfix': 'bugfix',
        'docs': 'docs',
        'doc': 'docs',
        'refactor': 'refactor',
        'chore': 'chore',
        'build': 'chore',
        'ci': 'chore',
    }
    if branch_prefix in branch_type_map:
        return branch_type_map[branch_prefix]

    categories = set(changes_by_category)
    if categories == {'docs'}:
        return 'docs'

    if categories and categories.issubset({'config', 'ci', 'infrastructure', 'scripts'}):
        return 'chore'

    commit_type_counts: Counter[str] = Counter()
    for message in commit_messages:
        subject = extract_commit_subject(message)
        match = re.match(r'(?P<kind>feat|fix|docs|refactor|chore|build|ci|test)(\(.+\))?!?:', subject)
        if match:
            commit_type_counts[match.group('kind')] += 1

    total_typed_commits = sum(commit_type_counts.values())
    fix_count = commit_type_counts.get('fix', 0)
    feat_count = commit_type_counts.get('feat', 0)

    if total_typed_commits > 0:
        if fix_count > feat_count and fix_count >= max(2, (total_typed_commits + 1) // 2):
            return 'bugfix'
        if commit_type_counts.get('docs', 0) == total_typed_commits:
            return 'docs'
        if feat_count > 0:
            return 'feature'
        if commit_type_counts.get('refactor', 0) == total_typed_commits:
            return 'refactor'
        if commit_type_counts.get('chore', 0) + commit_type_counts.get('build', 0) + commit_type_counts.get('ci', 0) == total_typed_commits:
            return 'chore'

    return 'feature'


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Analyze git changes for PR generation.')
    parser.add_argument('target_branch', nargs='?', default='main', help='Target branch to compare against (default: main)')
    parser.add_argument('--output', '-o', help='Optional JSON output path')
    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    target_branch = args.target_branch

    current_branch = get_current_branch()
    default_branch = get_default_branch()
    changed_files = get_changed_files(target_branch)
    commit_messages = get_commit_messages(target_branch)
    commit_message_bodies = get_commit_message_bodies(target_branch)
    issue_refs = extract_issue_references(commit_message_bodies or commit_messages)
    diff_stats = get_diff_stats(target_branch)

    # Categorize changes
    changes_by_category: Dict[str, List[Dict[str, str]]] = defaultdict(list)
    for status, filepath in changed_files:
        category = categorize_file(filepath)
        changes_by_category[category].append({
            'status': status,
            'file': filepath
        })

    # Infer PR type
    pr_type = infer_pr_type(current_branch, changes_by_category, commit_messages)
    total_files = len(changed_files)
    category_summary = summarize_categories(dict(changes_by_category))
    top_level_areas = summarize_top_level_areas(changed_files)
    classification = measure_classification_confidence(dict(changes_by_category), total_files)

    # Build result
    result = {
        'current_branch': current_branch,
        'branch_slug': sanitize_branch_name(current_branch),
        'target_branch': target_branch,
        'default_branch': default_branch,
        'target_is_default_branch': normalize_branch_name(target_branch) == default_branch if default_branch else False,
        'pr_type': pr_type,
        'stats': diff_stats,
        'commits': commit_messages,
        'issue_references': issue_refs['all'],
        'closing_issue_references': issue_refs['closing'],
        'related_issue_references': issue_refs['related'],
        'changes_by_category': dict(changes_by_category),
        'category_summary': category_summary,
        'top_level_areas': top_level_areas,
        'classification': classification,
        'total_files': total_files,
    }

    payload = json.dumps(result, indent=2)
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(payload + '\n', encoding='utf-8')
    else:
        print(payload)
    return 0


if __name__ == '__main__':
    sys.exit(main())

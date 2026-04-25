#!/usr/bin/env python3
"""
Generate PR body from template and analysis data.

Usage:
    python generate_pr_body.py <template_file> <analysis_json_file> [output_file]

If output_file is not specified, prints to stdout.
"""

import json
import re
import sys
from pathlib import Path
from typing import Dict, List


def load_template(template_path: str) -> str:
    """Load PR template from file."""
    with open(template_path, 'r', encoding='utf-8') as f:
        return f.read()


def load_analysis(analysis_path: str) -> Dict:
    """Load analysis JSON data."""
    with open(analysis_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def strip_commit_prefix(subject: str) -> str:
    """Drop conventional commit prefixes for cleaner prose."""
    cleaned = re.sub(r'^(feat|fix|docs|refactor|chore|build|ci|test)(\(.+?\))?!?:\s*', '', subject)
    return cleaned[:1].upper() + cleaned[1:] if cleaned else subject


def format_stats(analysis: Dict) -> str:
    """Format high-level diff statistics."""
    stats = analysis.get('stats', {})
    files = stats.get('files', 0)
    insertions = stats.get('insertions', 0)
    deletions = stats.get('deletions', 0)
    return f"{files} files changed, {insertions} insertions, {deletions} deletions"


def generate_summary(analysis: Dict) -> str:
    """Generate summary section from commits and changes."""
    commits = analysis.get('commits', [])
    top_level_areas = analysis.get('top_level_areas', [])

    if not commits:
        if top_level_areas:
            areas = ', '.join(f"`{area['area']}`" for area in top_level_areas[:3])
            return f"- Updates {format_stats(analysis)} across {areas}."
        return f"- Updates {format_stats(analysis)}."

    messages: List[str] = []
    seen = set()
    for commit in commits:
        parts = commit.split(' ', 1)
        subject = strip_commit_prefix(parts[1] if len(parts) > 1 else commit)
        if subject not in seen:
            seen.add(subject)
            messages.append(subject)

    if len(messages) == 1:
        return f"- {messages[0]}"

    summary_lines = []
    for msg in messages[:4]:
        summary_lines.append(f"- {msg}")

    if len(messages) > 4:
        additional_count = len(messages) - 4
        summary_lines.append(f"- Additional supporting updates across {additional_count} more commit themes")

    summary_lines.append(f"- Diff scope: {format_stats(analysis)}")

    return '\n'.join(summary_lines)


def format_label(raw_label: str) -> str:
    """Format category names for markdown output."""
    return raw_label.replace('_', ' ').title()


def format_samples(samples: List[str]) -> str:
    """Format representative samples for summary bullets."""
    if not samples:
        return ""

    sample_labels = [f"`{sample}`" for sample in samples[:3]]
    if len(sample_labels) == 1:
        return f", including {sample_labels[0]}"
    if len(sample_labels) == 2:
        return f", including {sample_labels[0]} and {sample_labels[1]}"
    return f", including {sample_labels[0]}, {sample_labels[1]}, and {sample_labels[2]}"


def format_issue_reference(issue_ref: str) -> str:
    """Normalize issue references for markdown output."""
    return issue_ref if '#' in issue_ref else f"#{issue_ref}"


def generate_area_breakdown(analysis: Dict) -> str:
    """Generate fallback changes breakdown using top-level areas."""
    areas = analysis.get('top_level_areas', [])
    lines = [f"- Diff scope: {format_stats(analysis)}."]

    for area in areas[:5]:
        lines.append(
            f"- `{area['area']}`: {area['file_count']} file(s){format_samples(area.get('samples', []))}."
        )

    return '\n'.join(lines)


def generate_changes_breakdown(analysis: Dict) -> str:
    """Generate changes breakdown by category or top-level area."""
    category_summary = analysis.get('category_summary', [])
    classification = analysis.get('classification', {})

    if not category_summary:
        return "No changes detected."

    if classification.get('confidence') == 'low':
        return generate_area_breakdown(analysis)

    lines = [f"- Diff scope: {format_stats(analysis)}."]
    for item in category_summary[:5]:
        category = item['category']
        if category == 'other':
            continue
        lines.append(
            f"- {format_label(category)}: {item['file_count']} file(s){format_samples(item.get('samples', []))}."
        )

    if classification.get('confidence') == 'medium':
        other_files = classification.get('other_files', 0)
        if other_files:
            lines.append(f"- Additional uncategorized changes: {other_files} file(s); reviewer notes may need manual refinement.")

    return '\n'.join(lines)


def generate_related_issues(analysis: Dict) -> str:
    """Generate related issues section."""
    issue_refs = analysis.get('issue_references', [])
    closing_refs = analysis.get('closing_issue_references', [])
    related_refs = analysis.get('related_issue_references')
    target_is_default_branch = analysis.get('target_is_default_branch', False)

    if not issue_refs:
        return "None"

    if related_refs is None:
        closing_ref_set = set(closing_refs)
        related_refs = [ref for ref in issue_refs if ref not in closing_ref_set]

    lines: List[str] = []
    if target_is_default_branch:
        lines.extend(f"- Closes {format_issue_reference(issue)}" for issue in closing_refs)
    elif closing_refs:
        lines.append(
            f"- Related issues are listed without closing keywords because base `{analysis.get('target_branch', 'unknown')}` is not confirmed as the repository default branch."
        )
        closing_ref_set = set(closing_refs)
        related_refs = closing_refs + [ref for ref in related_refs if ref not in closing_ref_set]

    lines.extend(f"- Related to {format_issue_reference(issue)}" for issue in related_refs)
    return '\n'.join(lines) if lines else "None"


def generate_checklist(analysis: Dict) -> str:
    """Generate appropriate checklist items based on changes."""
    changes = analysis.get('changes_by_category', {})
    checklist = []

    checklist.append("- [ ] Self-reviewed the code")
    checklist.append("- [ ] Breaking changes documented (if any)")

    if 'frontend' in changes or 'backend' in changes or 'application' in changes:
        checklist.append("- [ ] Automated tests added or updated as appropriate")

    if 'frontend' in changes:
        checklist.append("- [ ] UI changes reviewed; screenshots added if useful")

    if 'docs' in changes:
        checklist.append("- [ ] Documentation updated or confirmed unnecessary")

    if 'config' in changes or 'ci' in changes or 'infrastructure' in changes:
        checklist.append("- [ ] Config, CI, or deployment impact reviewed")

    has_tests = any(
        'test' in file_info['file'].lower()
        for files in changes.values()
        for file_info in files
    )

    if not has_tests and ('backend' in changes or 'frontend' in changes or 'application' in changes):
        checklist.append("- [ ] Follow-up test coverage considered")

    return '\n'.join(checklist)


def fill_template(template: str, analysis: Dict) -> str:
    """Fill template with generated content."""
    replacements = {
        '<!-- AUTO_SUMMARY -->': generate_summary(analysis),
        '<!-- AUTO_CHANGES -->': generate_changes_breakdown(analysis),
        '<!-- AUTO_ISSUES -->': generate_related_issues(analysis),
        '<!-- AUTO_CHECKLIST -->': generate_checklist(analysis),
    }

    result = template
    for placeholder, content in replacements.items():
        result = result.replace(placeholder, content)

    return result


def main():
    if len(sys.argv) < 3:
        print("Usage: python generate_pr_body.py <template_file> <analysis_json_file> [output_file]", file=sys.stderr)
        return 1

    template_file = sys.argv[1]
    analysis_file = sys.argv[2]
    output_file = sys.argv[3] if len(sys.argv) > 3 else None

    # Load inputs
    template = load_template(template_file)
    analysis = load_analysis(analysis_file)

    # Generate PR body
    pr_body = fill_template(template, analysis)

    # Output
    if output_file:
        Path(output_file).parent.mkdir(parents=True, exist_ok=True)
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(pr_body)
        print(f"PR body written to: {output_file}", file=sys.stderr)
    else:
        print(pr_body)

    return 0


if __name__ == '__main__':
    sys.exit(main())

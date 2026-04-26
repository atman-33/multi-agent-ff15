#!/usr/bin/env python3
"""
Generate a localized PR body from template and analysis data.

Usage:
    python generate_pr_body.py <template_file> <analysis_json_file> [output_file] [--language en|ja]

If output_file is not specified, prints to stdout.
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Dict, List


CATEGORY_LABELS = {
    "ja": {
        "frontend": "フロントエンド",
        "backend": "バックエンド",
        "application": "アプリケーション",
        "tests": "テスト",
        "docs": "ドキュメント",
        "config": "設定",
        "ci": "CI",
        "infrastructure": "インフラ",
        "scripts": "スクリプト",
        "assets": "アセット",
        "data": "データ",
        "other": "その他",
    }
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate a localized PR body from template and analysis data.")
    parser.add_argument("template_file", help="Path to the PR template file")
    parser.add_argument("analysis_json_file", help="Path to the change analysis JSON file")
    parser.add_argument("output_file", nargs="?", help="Optional output path for the generated PR body")
    parser.add_argument("--language", "-l", help="Requested output language, for example en or ja")
    return parser


def normalize_language(language: str) -> str:
    lowered = (language or "").strip().lower()
    if lowered.startswith("ja"):
        return "ja"
    return "en"


def infer_language_from_template(template_path: str) -> str:
    return "ja" if Path(template_path).stem.lower().endswith("-ja") else "en"


def load_template(template_path: str) -> str:
    """Load PR template from file."""
    with open(template_path, "r", encoding="utf-8") as handle:
        return handle.read()


def load_analysis(analysis_path: str) -> Dict:
    """Load analysis JSON data."""
    with open(analysis_path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def strip_commit_prefix(subject: str) -> str:
    """Drop conventional commit prefixes for cleaner prose."""
    cleaned = re.sub(r"^(feat|fix|docs|refactor|chore|build|ci|test)(\(.+?\))?!?:\s*", "", subject)
    return cleaned[:1].upper() + cleaned[1:] if cleaned else subject


def format_stats(analysis: Dict, language: str) -> str:
    """Format high-level diff statistics."""
    stats = analysis.get("stats", {})
    files = stats.get("files", 0)
    insertions = stats.get("insertions", 0)
    deletions = stats.get("deletions", 0)
    if normalize_language(language) == "ja":
        return f"{files} 件 / +{insertions} / -{deletions}"
    return f"{files} files changed, {insertions} insertions, {deletions} deletions"


def format_label(raw_label: str, language: str) -> str:
    """Format category names for markdown output."""
    if normalize_language(language) == "ja":
        return CATEGORY_LABELS["ja"].get(raw_label, raw_label)
    return raw_label.replace("_", " ").title()


def format_items(items: List[str], language: str) -> str:
    """Join display items with locale-aware punctuation."""
    if not items:
        return ""
    if normalize_language(language) == "ja":
        return "、".join(items)
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])}, and {items[-1]}"


def format_samples(samples: List[str], language: str) -> str:
    """Format representative samples for summary bullets."""
    if not samples:
        return ""

    sample_labels = [f"`{sample}`" for sample in samples[:3]]
    if normalize_language(language) == "ja":
        return f"。主な対象: {format_items(sample_labels, language)}"

    if len(sample_labels) == 1:
        return f", including {sample_labels[0]}"
    if len(sample_labels) == 2:
        return f", including {sample_labels[0]} and {sample_labels[1]}"
    return f", including {sample_labels[0]}, {sample_labels[1]}, and {sample_labels[2]}"


def generate_summary(analysis: Dict, language: str) -> str:
    """Generate summary section from commits and changes."""
    commits = analysis.get("commits", [])
    top_level_areas = analysis.get("top_level_areas", [])
    language = normalize_language(language)

    if not commits:
        if top_level_areas:
            areas = format_items([f"`{area['area']}`" for area in top_level_areas[:3]], language)
            if language == "ja":
                return f"- {areas} を中心に {format_stats(analysis, language)} の更新。"
            return f"- Updates {format_stats(analysis, language)} across {areas}."
        if language == "ja":
            return f"- {format_stats(analysis, language)} の更新。"
        return f"- Updates {format_stats(analysis, language)}."

    messages: List[str] = []
    seen = set()
    for commit in commits:
        parts = commit.split(" ", 1)
        subject = strip_commit_prefix(parts[1] if len(parts) > 1 else commit)
        if subject not in seen:
            seen.add(subject)
            messages.append(subject)

    if len(messages) == 1:
        return f"- {messages[0]}"

    summary_lines = [f"- {message}" for message in messages[:4]]
    if len(messages) > 4:
        additional_count = len(messages) - 4
        if language == "ja":
            summary_lines.append(f"- ほか {additional_count} 件の変更テーマにまたがる補足更新")
        else:
            summary_lines.append(f"- Additional supporting updates across {additional_count} more commit themes")

    if language == "ja":
        summary_lines.append(f"- 差分規模: {format_stats(analysis, language)}")
    else:
        summary_lines.append(f"- Diff scope: {format_stats(analysis, language)}")

    return "\n".join(summary_lines)


def format_issue_reference(issue_ref: str) -> str:
    """Normalize issue references for markdown output."""
    return issue_ref if "#" in issue_ref else f"#{issue_ref}"


def generate_area_breakdown(analysis: Dict, language: str) -> str:
    """Generate fallback changes breakdown using top-level areas."""
    areas = analysis.get("top_level_areas", [])
    language = normalize_language(language)

    if language == "ja":
        lines = [f"- 差分規模: {format_stats(analysis, language)}。"]
    else:
        lines = [f"- Diff scope: {format_stats(analysis, language)}."]

    for area in areas[:5]:
        if language == "ja":
            lines.append(f"- `{area['area']}`: {area['file_count']} 件{format_samples(area.get('samples', []), language)}")
        else:
            lines.append(
                f"- `{area['area']}`: {area['file_count']} file(s){format_samples(area.get('samples', []), language)}."
            )

    return "\n".join(lines)


def generate_changes_breakdown(analysis: Dict, language: str) -> str:
    """Generate changes breakdown by category or top-level area."""
    category_summary = analysis.get("category_summary", [])
    classification = analysis.get("classification", {})
    language = normalize_language(language)

    if not category_summary:
        return "差分は検出されませんでした。" if language == "ja" else "No changes detected."

    if classification.get("confidence") == "low":
        return generate_area_breakdown(analysis, language)

    if language == "ja":
        lines = [f"- 差分規模: {format_stats(analysis, language)}。"]
    else:
        lines = [f"- Diff scope: {format_stats(analysis, language)}."]

    for item in category_summary[:5]:
        category = item["category"]
        if category == "other":
            continue
        if language == "ja":
            lines.append(
                f"- {format_label(category, language)}: {item['file_count']} 件{format_samples(item.get('samples', []), language)}"
            )
        else:
            lines.append(
                f"- {format_label(category, language)}: {item['file_count']} file(s){format_samples(item.get('samples', []), language)}."
            )

    if classification.get("confidence") == "medium":
        other_files = classification.get("other_files", 0)
        if other_files:
            if language == "ja":
                lines.append(f"- 未分類の差分: {other_files} 件。reviewer 向けの説明は手動調整が必要な場合があります。")
            else:
                lines.append(
                    f"- Additional uncategorized changes: {other_files} file(s); reviewer notes may need manual refinement."
                )

    return "\n".join(lines)


def generate_related_issues(analysis: Dict, language: str) -> str:
    """Generate related issues section."""
    issue_refs = analysis.get("issue_references", [])
    closing_refs = analysis.get("closing_issue_references", [])
    related_refs = analysis.get("related_issue_references")
    target_is_default_branch = analysis.get("target_is_default_branch", False)
    language = normalize_language(language)

    if not issue_refs:
        return "なし" if language == "ja" else "None"

    if related_refs is None:
        closing_ref_set = set(closing_refs)
        related_refs = [ref for ref in issue_refs if ref not in closing_ref_set]

    lines: List[str] = []
    if target_is_default_branch:
        lines.extend(f"- Closes {format_issue_reference(issue)}" for issue in closing_refs)
    elif closing_refs:
        if language == "ja":
            lines.append(
                f"- base `{analysis.get('target_branch', 'unknown')}` が repository default branch と断定できないため、closing keyword ではなく関連 issue として記載しています。"
            )
        else:
            lines.append(
                f"- Related issues are listed without closing keywords because base `{analysis.get('target_branch', 'unknown')}` is not confirmed as the repository default branch."
            )
        closing_ref_set = set(closing_refs)
        related_refs = closing_refs + [ref for ref in related_refs if ref not in closing_ref_set]

    if language == "ja":
        lines.extend(f"- 関連: {format_issue_reference(issue)}" for issue in related_refs)
        return "\n".join(lines) if lines else "なし"

    lines.extend(f"- Related to {format_issue_reference(issue)}" for issue in related_refs)
    return "\n".join(lines) if lines else "None"


def generate_checklist(analysis: Dict, language: str) -> str:
    """Generate appropriate checklist items based on changes."""
    changes = analysis.get("changes_by_category", {})
    checklist = []
    language = normalize_language(language)

    if language == "ja":
        checklist.append("- [ ] 自己レビューを行った")
        checklist.append("- [ ] Breaking change がある場合は影響を明記した")
    else:
        checklist.append("- [ ] Self-reviewed the code")
        checklist.append("- [ ] Breaking changes documented (if any)")

    if "frontend" in changes or "backend" in changes or "application" in changes:
        if language == "ja":
            checklist.append("- [ ] 必要に応じて自動テストを追加または更新した")
        else:
            checklist.append("- [ ] Automated tests added or updated as appropriate")

    if "frontend" in changes:
        if language == "ja":
            checklist.append("- [ ] UI 変更を確認し、必要ならスクリーンショットを用意した")
        else:
            checklist.append("- [ ] UI changes reviewed; screenshots added if useful")

    if "docs" in changes:
        if language == "ja":
            checklist.append("- [ ] ドキュメント更新の要否を確認した")
        else:
            checklist.append("- [ ] Documentation updated or confirmed unnecessary")

    if "config" in changes or "ci" in changes or "infrastructure" in changes:
        if language == "ja":
            checklist.append("- [ ] 設定・CI・デプロイ影響を確認した")
        else:
            checklist.append("- [ ] Config, CI, or deployment impact reviewed")

    has_tests = any(
        "test" in file_info["file"].lower()
        for files in changes.values()
        for file_info in files
    )

    if not has_tests and ("backend" in changes or "frontend" in changes or "application" in changes):
        if language == "ja":
            checklist.append("- [ ] 追加の test coverage 要否を検討した")
        else:
            checklist.append("- [ ] Follow-up test coverage considered")

    return "\n".join(checklist)


def fill_template(template: str, analysis: Dict, language: str) -> str:
    """Fill template with generated content."""
    replacements = {
        "<!-- AUTO_SUMMARY -->": generate_summary(analysis, language),
        "<!-- AUTO_CHANGES -->": generate_changes_breakdown(analysis, language),
        "<!-- AUTO_ISSUES -->": generate_related_issues(analysis, language),
        "<!-- AUTO_CHECKLIST -->": generate_checklist(analysis, language),
    }

    result = template
    for placeholder, content in replacements.items():
        result = result.replace(placeholder, content)

    return result


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    template_file = args.template_file
    analysis_file = args.analysis_json_file
    output_file = args.output_file
    language = normalize_language(args.language or infer_language_from_template(template_file))

    template = load_template(template_file)
    analysis = load_analysis(analysis_file)
    pr_body = fill_template(template, analysis, language)

    if output_file:
        Path(output_file).parent.mkdir(parents=True, exist_ok=True)
        with open(output_file, "w", encoding="utf-8") as handle:
            handle.write(pr_body)
        print(f"PR body written to: {output_file}", file=sys.stderr)
    else:
        print(pr_body)

    return 0


if __name__ == "__main__":
    sys.exit(main())

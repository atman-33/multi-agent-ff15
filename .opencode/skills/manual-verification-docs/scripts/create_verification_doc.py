from __future__ import annotations

import argparse
import re
from datetime import datetime
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a dated manual verification markdown scaffold."
    )
    parser.add_argument(
        "--slug",
        required=True,
        help="File suffix in kebab-case, for example salary-recipient-info",
    )
    parser.add_argument(
        "--title",
        required=True,
        help="Document title shown in the markdown file",
    )
    output_group = parser.add_mutually_exclusive_group(required=True)
    output_group.add_argument(
        "--output-path",
        help="Exact markdown file path to write",
    )
    output_group.add_argument(
        "--output-dir",
        help="Directory where a dated markdown file should be created",
    )
    return parser.parse_args()


def normalize_slug(raw_slug: str) -> str:
    slug = raw_slug.strip().lower()
    slug = slug.replace("_", "-")
    slug = re.sub(r"\s+", "-", slug)
    slug = re.sub(r"[^a-z0-9-]", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "verification"


def build_output_path(base_dir: Path, slug: str) -> Path:
    date_prefix = datetime.now().strftime("%Y%m%d")
    candidate = base_dir / f"{date_prefix}-{slug}.md"
    if not candidate.exists():
        return candidate

    counter = 2
    while True:
        candidate = base_dir / f"{date_prefix}-{slug}-{counter}.md"
        if not candidate.exists():
            return candidate
        counter += 1


def expand_cli_path(raw_path: str) -> Path:
    path = Path(raw_path).expanduser()
    return path if path.is_absolute() else Path.cwd() / path


def resolve_output_path(args: argparse.Namespace, slug: str) -> Path:
    if args.output_path:
        return expand_cli_path(args.output_path)

    output_dir = expand_cli_path(args.output_dir)
    return build_output_path(output_dir, slug)


def build_content(title: str, file_name: str) -> str:
    created_at = datetime.now().strftime("%Y-%m-%d")
    return f"""# Manual Verification Guide: {title}

## Document Info

- Created on: {created_at}
- Scope: {title}
- Output file: {file_name}

## Change Summary

- What changed:
- User impact:
- Related screens / APIs / jobs:

## Preconditions

- [ ] Target environment is running.
- [ ] Required test data, permissions, and configuration values are prepared.
- [ ] Relevant screens, APIs, and logs can be inspected.

## Verification Checklist

### 1. Happy Path

- [ ] Primary user flow works end to end.
    Expected result:
    Evidence / notes:

- [ ] Success feedback appears after the main action.
    Expected result:
    Evidence / notes:

### 2. Edge Cases / Input Variations

- [ ] Boundary input values are handled correctly.
    Expected result:
    Evidence / notes:

- [ ] Invalid or incomplete input is rejected safely.
    Expected result:
    Evidence / notes:

### 3. Error Handling / Permissions

- [ ] Error handling is visible and understandable.
    Expected result:
    Evidence / notes:

- [ ] Permission rules are enforced correctly.
    Expected result:
    Evidence / notes:

## Observation Notes

- UI behavior:
- API responses:
- Validation:
- Notifications / side effects:

## Open Items And Constraints

- Not yet verified:
- Known constraints:

## Execution Record

- Verified by:
- Verified on:
- Overall result:
- Notes:
"""


def main() -> None:
    args = parse_args()
    slug = normalize_slug(args.slug)
    output_path = resolve_output_path(args, slug)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        build_content(title=args.title.strip(), file_name=output_path.name),
        encoding="utf-8",
    )
    print(output_path.resolve())


if __name__ == "__main__":
    main()

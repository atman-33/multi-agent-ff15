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


def resolve_report_dir(script_path: Path) -> Path:
    for parent in script_path.parents:
        if (parent / ".git").exists():
            return parent / "docs" / "reports"

    raise FileNotFoundError("Could not locate the repository root from the script path.")


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

1. Start the target environment.
2. Confirm the required test data, permissions, and configuration values.
3. Prepare how to inspect the relevant screens, APIs, and logs.

## Verification Scenarios

### 1. Happy Path

- Objective:
- Steps:
  1.
  2.
  3.
- Expected results:
  -
  -

### 2. Edge Cases / Input Variations

- Objective:
- Steps:
  1.
  2.
- Expected results:
  -

### 3. Error Handling / Permissions

- Objective:
- Steps:
  1.
  2.
- Expected results:
  -

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
- Result:
- Notes:
"""


def main() -> None:
    args = parse_args()
    output_dir = resolve_report_dir(Path(__file__).resolve())
    output_dir.mkdir(parents=True, exist_ok=True)

    slug = normalize_slug(args.slug)
    output_path = build_output_path(output_dir, slug)
    output_path.write_text(
        build_content(title=args.title.strip(), file_name=output_path.name),
        encoding="utf-8",
    )
    print(output_path)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Atomic file writer for OpenCode plugins.

Writes content to a temp file then uses os.rename() for an atomic swap,
preventing partial writes that could corrupt YAML dashboard files.

Usage:
  python3 .opencode/lib/yaml_atomic_write.py <content> <tmp_path> <target_path>

Arguments:
  content      The string content to write.
  tmp_path     Temporary file path (e.g. dashboard.md.tmp).
  target_path  Final destination path (e.g. dashboard.md).
"""

import sys
import os


def main() -> None:
    if len(sys.argv) < 4:
        print(
            "Usage: yaml_atomic_write.py <content> <tmp_path> <target_path>",
            file=sys.stderr,
        )
        sys.exit(1)

    content = sys.argv[1]
    tmp = sys.argv[2]
    target = sys.argv[3]

    with open(tmp, "w") as f:
        f.write(content)
    os.rename(tmp, target)


if __name__ == "__main__":
    main()

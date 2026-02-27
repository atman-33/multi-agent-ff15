#!/usr/bin/env python3
"""
YAML configuration reader utility for scripts/*.sh.

Provides safe YAML reading operations used by shell scripts.

Usage:
  python3 scripts/lib/yaml_config_reader.py active-ids <config_file>
      Read active_project_ids from the config file and print one ID per line.
      Outputs nothing if the file is missing or has no active IDs.

Exit codes:
  0 = success (even if file is missing — prints nothing)
  1 = error
"""

import sys
import yaml


def active_ids(config_file: str) -> None:
    """Read active_project_ids from a YAML config file and print one per line."""
    try:
        with open(config_file, "r") as f:
            data = yaml.safe_load(f) or {}
        ids = data.get("active_project_ids", []) or []
        for pid in ids:
            print(pid)
    except FileNotFoundError:
        pass  # No file → no output (not an error)
    except Exception as e:
        sys.stderr.write(f"WARNING: Failed to parse {config_file}: {e}\n")


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: yaml_config_reader.py <mode> [args...]", file=sys.stderr)
        sys.exit(1)

    mode = sys.argv[1]

    if mode == "active-ids":
        if len(sys.argv) < 3:
            print("Usage: yaml_config_reader.py active-ids <config_file>", file=sys.stderr)
            sys.exit(1)
        active_ids(sys.argv[2])
    else:
        print(f"Unknown mode: {mode}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

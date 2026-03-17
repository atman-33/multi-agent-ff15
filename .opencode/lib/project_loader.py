#!/usr/bin/env python3
"""
Project YAML loader for OpenCode plugins.

Usage:
    python3 .opencode/lib/project_loader.py active-ids <scope>
            Reads config/current_projects.yaml and prints scoped active_project_ids as JSON.
      Output: ["id1", "id2", ...]  (or [] if none)

  python3 .opencode/lib/project_loader.py project-def <project_id>
      Reads projects/<project_id>.yaml and prints the full definition as JSON.
      Output: {...}  (or null if not found)
"""

import sys
import json
import yaml


VALID_SCOPES = {"noctis_team", "lunafreya"}


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: project_loader.py <mode> [args]", file=sys.stderr)
        sys.exit(1)

    mode = sys.argv[1]

    if mode == "active-ids":
        if len(sys.argv) < 3:
            print("Usage: project_loader.py active-ids <scope>", file=sys.stderr)
            sys.exit(1)
        scope = sys.argv[2]
        if scope not in VALID_SCOPES:
            print("[]")
            return
        try:
            with open("config/current_projects.yaml", "r") as f:
                data = yaml.safe_load(f) or {}
            ids = data.get("project_scopes", {}).get(scope, {}).get("active_project_ids", []) or []
            print(json.dumps(ids))
        except FileNotFoundError:
            print("[]")
        except Exception as e:
            sys.stderr.write(str(e))
            print("[]")

    elif mode == "project-def":
        if len(sys.argv) < 3:
            print("Usage: project_loader.py project-def <project_id>", file=sys.stderr)
            sys.exit(1)
        project_id = sys.argv[2]
        try:
            with open(f"projects/{project_id}.yaml", "r") as f:
                data = yaml.safe_load(f) or {}
            print(json.dumps(data, default=str))
        except FileNotFoundError:
            print("null")
        except Exception as e:
            sys.stderr.write(str(e))
            print("null")

    else:
        print(f"Unknown mode: {mode}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

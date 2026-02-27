#!/usr/bin/env python3
"""
Inbox YAML reader utility for OpenCode plugins.

Usage:
  python3 .opencode/lib/inbox_reader.py <inbox_path> <mode> [options]

Modes:
  latest-unread-id
      Print the ID of the latest unread message (empty output if none).

  report-fields
      Print pipe-delimited fields for each report_received message.
      Output: id~from~status~summary~task_id  (one line per message)

  task-fields
      Print pipe-delimited fields for each task_assigned message.
      Output: id~description~task_id  (one line per message)

  luna-fields
      Print pipe-delimited fields for lunafreya messages/instructions.
      Output: id~content  (one line per message)

  filter-json --types T1 [T2 ...]
      Print a JSON array of messages matching the given types.
      Output: [{"id": ..., "type": ..., "from": ..., "content": ...}, ...]
"""

import sys
import json
import yaml


def load_messages(inbox_path: str) -> list:
    try:
        with open(inbox_path, "r") as f:
            data = yaml.safe_load(f) or {}
        return data.get("messages", [])
    except FileNotFoundError:
        return []
    except Exception as e:
        sys.stderr.write(f"Error reading {inbox_path}: {e}\n")
        return []


def main() -> None:
    if len(sys.argv) < 3:
        print("Usage: inbox_reader.py <inbox_path> <mode> [options]", file=sys.stderr)
        sys.exit(1)

    inbox_path = sys.argv[1]
    mode = sys.argv[2]
    messages = load_messages(inbox_path)

    if mode == "latest-unread-id":
        unread = [
            m for m in messages
            if isinstance(m, dict) and not m.get("read", False)
        ]
        if unread:
            unread.sort(key=lambda m: m.get("timestamp", ""), reverse=True)
            print(unread[0].get("id", ""))

    elif mode == "report-fields":
        # Output: id~from~status~summary~task_id
        for m in messages:
            if not isinstance(m, dict) or m.get("type") != "report_received":
                continue
            content = m.get("content", "")
            status = "done"
            summary = ""
            task_id = ""
            for line in content.split("\n"):
                line = line.strip()
                if line.startswith("status:"):
                    status = line.split(":", 1)[1].strip()
                elif line.startswith("summary:"):
                    summary = line.split(":", 1)[1].strip().strip('"')
                elif line.startswith("task_id:"):
                    task_id = line.split(":", 1)[1].strip().strip('"')
            mid = m.get("id", "?")
            mfrom = m.get("from", "?")
            print(f"{mid}~{mfrom}~{status}~{summary}~{task_id}")

    elif mode == "task-fields":
        # Output: id~description~task_id
        for m in messages:
            if not isinstance(m, dict) or m.get("type") != "task_assigned":
                continue
            content = m.get("content", "")
            description = ""
            task_id = ""
            for line in content.split("\n"):
                line = line.strip()
                if line.startswith("description:"):
                    description = line.split(":", 1)[1].strip().strip('"')
                elif line.startswith("task_id:"):
                    task_id = line.split(":", 1)[1].strip().strip('"')
            print(f"{m.get('id', '?')}~{description}~{task_id}")

    elif mode == "luna-fields":
        # Output: id~content  for lunafreya message/luna_instruction
        for m in messages:
            if not isinstance(m, dict):
                continue
            if m.get("from") != "lunafreya":
                continue
            if m.get("type") not in ("message", "luna_instruction"):
                continue
            content = m.get("content", "")
            print(f"{m.get('id', '?')}~{content}")

    elif mode == "filter-json":
        # --types T1 T2 ...
        filter_types: list = []
        if "--types" in sys.argv:
            types_idx = sys.argv.index("--types")
            filter_types = sys.argv[types_idx + 1:]

        result = []
        for m in messages:
            if not isinstance(m, dict):
                continue
            if filter_types and m.get("type", "") not in filter_types:
                continue
            result.append({
                "id": m.get("id", "?"),
                "type": m.get("type", "unknown"),
                "from": m.get("from", "?"),
                "content": m.get("content", ""),
            })
        print(json.dumps(result))

    else:
        print(f"Unknown mode: {mode}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

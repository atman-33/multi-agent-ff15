#!/usr/bin/env python3
"""
Report missing check for agent-report-reminder plugin.

Checks whether the agent has submitted a report for its latest assigned task.

Usage:
  python3 .opencode/lib/report_checker.py <agent_id>

Output:
  "MISSING:<task_id>"  if the report is missing
  (empty)              if the report exists or no task is assigned
"""

import sys
import os
import re
import yaml


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: report_checker.py <agent_id>", file=sys.stderr)
        sys.exit(1)

    agent_id = sys.argv[1]
    inbox_file = f"queue/inbox/{agent_id}.yaml"
    noctis_file = "queue/inbox/noctis.yaml"

    if not os.path.exists(inbox_file):
        sys.exit(0)

    try:
        with open(inbox_file, "r") as f:
            inbox_data = yaml.safe_load(f) or {}
    except Exception:
        sys.exit(0)

    messages = inbox_data.get("messages", [])
    latest_task_id = None

    # Find the most recent task assigned to this agent
    for m in reversed(messages):
        if not isinstance(m, dict):
            continue
        if m.get("from") == "noctis" and m.get("type") == "task_assigned":
            content = m.get("content", "")
            match = re.search(r'task_id:\s*"?([\w-]+)"?', content)
            if match:
                latest_task_id = match.group(1)
                break

    if not latest_task_id:
        sys.exit(0)

    # Check if a report for this task exists in noctis's inbox
    if not os.path.exists(noctis_file):
        print(f"MISSING:{latest_task_id}")
        sys.exit(0)

    try:
        with open(noctis_file, "r") as f:
            noctis_data = yaml.safe_load(f) or {}
    except Exception:
        sys.exit(0)

    noctis_messages = noctis_data.get("messages", [])
    reported = False
    for m in noctis_messages:
        if not isinstance(m, dict):
            continue
        if m.get("from") == agent_id and m.get("type") == "report_received":
            if latest_task_id in m.get("content", ""):
                reported = True
                break

    if not reported:
        print(f"MISSING:{latest_task_id}")


if __name__ == "__main__":
    main()

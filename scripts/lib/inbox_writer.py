#!/usr/bin/env python3
"""
Inbox writer utility for scripts/*.sh.

Handles atomic message append to agent inbox YAML and JSONL chat logging.

Usage:
  python3 scripts/lib/inbox_writer.py log-message <log_file> <lock_file> <msg_id> <timestamp> <from> <to> <type> <content>
      Append a JSON record to the agent-messages JSONL log.

  python3 scripts/lib/inbox_writer.py append-message <inbox_file> <tmp_file> <msg_id> <from> <timestamp> <type> <content>
      Atomically append a message to the inbox YAML, with overflow pruning
      (keeps all unread + newest 30 read, max 50 total).

Exit codes:
  0 = success
  2 = YAML error
  1 = other error
"""

import sys
import json
import os

try:
    import fcntl
except ImportError:
    fcntl = None  # type: ignore[assignment]

import yaml


def log_message(
    log_file: str,
    lock_file: str,
    msg_id: str,
    timestamp: str,
    from_agent: str,
    to_agent: str,
    msg_type: str,
    content: str,
) -> None:
    """Append a JSON record to agent-messages.jsonl for chat display."""
    record = json.dumps(
        {
            "id": msg_id,
            "ts": timestamp,
            "from": from_agent,
            "to": to_agent,
            "type": msg_type,
            "content": content,
        },
        ensure_ascii=False,
    )

    with open(lock_file, "a") as lf:
        if fcntl:
            fcntl.flock(lf, fcntl.LOCK_EX)
        try:
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(record + "\n")
        finally:
            if fcntl:
                fcntl.flock(lf, fcntl.LOCK_UN)


def _ts_key(m: dict) -> str:
    """Extract a sortable timestamp string from a message dict."""
    ts = m.get("timestamp", "")
    # yaml.safe_load may parse timestamps as datetime objects; convert to str
    if hasattr(ts, "isoformat"):
        return ts.isoformat()
    return str(ts) if ts else ""


def append_message(
    inbox_file: str,
    tmp_file: str,
    msg_id: str,
    from_agent: str,
    timestamp: str,
    msg_type: str,
    content: str,
) -> None:
    """Atomically append a message to the inbox YAML with overflow pruning."""
    try:
        if os.path.exists(inbox_file):
            with open(inbox_file, "r") as f:
                data = yaml.safe_load(f) or {}
        else:
            data = {}

        messages = data.get("messages", [])
        if not isinstance(messages, list):
            messages = []

        # Deduplicate: skip if message ID already exists
        for m in messages:
            if isinstance(m, dict) and m.get("id") == msg_id:
                sys.exit(0)

        new_msg = {
            "id": msg_id,
            "from": from_agent,
            "timestamp": timestamp,
            "type": msg_type,
            "content": content,
            "read": False,
        }
        messages.append(new_msg)

        # Overflow pruning: keep all unread + newest 30 read
        unread = [m for m in messages if isinstance(m, dict) and not m.get("read", True)]
        read_msgs = [m for m in messages if isinstance(m, dict) and m.get("read", True)]
        read_msgs.sort(key=_ts_key, reverse=True)
        pruned_read = read_msgs[:30]
        messages = unread + pruned_read
        messages.sort(key=_ts_key)

        data["messages"] = messages

        with open(tmp_file, "w") as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

        os.rename(tmp_file, inbox_file)
        sys.exit(0)

    except yaml.YAMLError as e:
        print(f"YAML error: {e}", file=sys.stderr)
        if os.path.exists(tmp_file):
            os.remove(tmp_file)
        sys.exit(2)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        if os.path.exists(tmp_file):
            os.remove(tmp_file)
        sys.exit(2)


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: inbox_writer.py <mode> [args...]", file=sys.stderr)
        sys.exit(1)

    mode = sys.argv[1]

    if mode == "log-message":
        if len(sys.argv) < 10:
            print(
                "Usage: inbox_writer.py log-message <log_file> <lock_file> "
                "<msg_id> <timestamp> <from> <to> <type> <content>",
                file=sys.stderr,
            )
            sys.exit(1)
        log_message(
            log_file=sys.argv[2],
            lock_file=sys.argv[3],
            msg_id=sys.argv[4],
            timestamp=sys.argv[5],
            from_agent=sys.argv[6],
            to_agent=sys.argv[7],
            msg_type=sys.argv[8],
            content=sys.argv[9],
        )

    elif mode == "append-message":
        if len(sys.argv) < 9:
            print(
                "Usage: inbox_writer.py append-message <inbox_file> <tmp_file> "
                "<msg_id> <from> <timestamp> <type> <content>",
                file=sys.stderr,
            )
            sys.exit(1)
        append_message(
            inbox_file=sys.argv[2],
            tmp_file=sys.argv[3],
            msg_id=sys.argv[4],
            from_agent=sys.argv[5],
            timestamp=sys.argv[6],
            msg_type=sys.argv[7],
            content=sys.argv[8],
        )

    else:
        print(f"Unknown mode: {mode}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Inbox reader utility for scripts/*.sh.

Reads unread messages from an agent inbox YAML and optionally marks them as read.

Usage:
  python3 scripts/lib/inbox_reader.py <inbox_file> <mode> [options]

Modes:
  peek
      Print count of unread messages only (no state change).

  read-and-mark
      Print all unread messages in chronological order, then mark them as read.
      Uses flock for safe concurrent access.

Options (environment variables):
  ENABLE_INBOX_READ_LOG=true   Enable debug logging.
  INBOX_READ_LOG_FILE=<path>   Override the log file path.

Exit codes:
  0 = success
  2 = error
"""

import sys
import os
import time
from datetime import datetime

try:
    import fcntl
except ImportError:
    fcntl = None  # type: ignore[assignment]

import yaml


def _log(log_file: str, enable_log: bool, msg: str) -> None:
    if not enable_log:
        return
    timestamp = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    with open(log_file, "a") as lf:
        lf.write(f"[{timestamp}] inbox_reader.py: {msg}\n")


def _acquire_lock(lf, log_file: str, enable_log: bool) -> None:
    """Acquire an exclusive flock with retries."""
    if not fcntl:
        return
    for attempt in range(3):
        try:
            fcntl.flock(lf, fcntl.LOCK_EX | fcntl.LOCK_NB)
            _log(log_file, enable_log, f"[LOCK] Acquired on attempt {attempt + 1}")
            return
        except BlockingIOError:
            _log(log_file, enable_log, f"[LOCK] Blocked on attempt {attempt + 1}, waiting...")
            time.sleep([0.5, 1, 2][attempt])
    _log(log_file, enable_log, "[LOCK] Waiting for exclusive lock (blocking)...")
    fcntl.flock(lf, fcntl.LOCK_EX)
    _log(log_file, enable_log, "[LOCK] Acquired (after blocking)")


def peek(inbox_file: str, log_file: str, enable_log: bool) -> None:
    """Print count of unread messages without modifying state."""
    _log(log_file, enable_log, "[PEEK] Start")

    if not os.path.exists(inbox_file):
        _log(log_file, enable_log, "[RESULT] No inbox file found, returning 0 unread")
        print("0 unread messages")
        return

    try:
        with open(inbox_file, "r") as f:
            data = yaml.safe_load(f) or {}
    except Exception as e:
        _log(log_file, enable_log, f"[ERROR] {e}")
        print(f"Error reading inbox: {e}", file=sys.stderr)
        sys.exit(2)

    messages = data.get("messages", [])
    if not isinstance(messages, list):
        messages = []

    unread = [m for m in messages if isinstance(m, dict) and not m.get("read", True)]
    _log(log_file, enable_log, f"[PEEK] Returning unread count: {len(unread)}")
    print(f"{len(unread)} unread messages")


def read_and_mark(inbox_file: str, log_file: str, enable_log: bool) -> None:
    """Print unread messages and mark them as read (with flock)."""
    _log(log_file, enable_log, "[READ] Start")

    if not os.path.exists(inbox_file):
        _log(log_file, enable_log, "[RESULT] No inbox file found, returning 0 unread")
        print("0 unread messages")
        return

    lock_file = inbox_file + ".lock"

    try:
        with open(lock_file, "w") as lf:
            _log(log_file, enable_log, "[LOCK] Attempting to acquire lock...")
            _acquire_lock(lf, log_file, enable_log)

            with open(inbox_file, "r") as f:
                data = yaml.safe_load(f) or {}
            _log(
                log_file,
                enable_log,
                f"[READ] Loaded inbox data, message count: {len(data.get('messages', []))}",
            )

            messages = data.get("messages", [])
            if not isinstance(messages, list):
                messages = []

            unread = [m for m in messages if isinstance(m, dict) and not m.get("read", True)]
            unread.sort(key=lambda m: m.get("timestamp", ""))
            _log(log_file, enable_log, f"[FILTER] Unread count: {len(unread)}")

            if not unread:
                _log(log_file, enable_log, "[RESULT] No unread messages")
                print("0 unread messages")
                if fcntl:
                    fcntl.flock(lf, fcntl.LOCK_UN)
                return

            _log(log_file, enable_log, f"[DISPLAY] Showing {len(unread)} unread messages")
            print(f"{len(unread)} unread message(s):")
            print("---")
            for msg in unread:
                print(f"id: {msg.get('id', '?')}")
                print(f"from: {msg.get('from', '?')}")
                print(f"type: {msg.get('type', '?')}")
                print(f"time: {msg.get('timestamp', '?')}")
                print(f"content: {msg.get('content', '')}")
                print("---")
                msg["read"] = True

            _log(log_file, enable_log, f"[MARK] Marked {len(unread)} messages as read")

            data["messages"] = messages
            tmp_file = inbox_file + ".tmp"
            with open(tmp_file, "w") as f:
                yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
            os.rename(tmp_file, inbox_file)
            _log(log_file, enable_log, "[WRITE] Updated inbox file with read status")

            if fcntl:
                fcntl.flock(lf, fcntl.LOCK_UN)
            _log(log_file, enable_log, "[LOCK] Released lock")

    except Exception as e:
        _log(log_file, enable_log, f"[ERROR] {e}")
        print(f"Error reading inbox: {e}", file=sys.stderr)
        sys.exit(2)


def main() -> None:
    if len(sys.argv) < 3:
        print("Usage: inbox_reader.py <inbox_file> <mode>", file=sys.stderr)
        sys.exit(1)

    inbox_file = sys.argv[1]
    mode = sys.argv[2]

    enable_log = os.environ.get("ENABLE_INBOX_READ_LOG", "false") == "true"
    log_file = os.environ.get("INBOX_READ_LOG_FILE", "")

    if mode == "peek":
        peek(inbox_file, log_file, enable_log)
    elif mode == "read-and-mark":
        read_and_mark(inbox_file, log_file, enable_log)
    else:
        print(f"Unknown mode: {mode}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

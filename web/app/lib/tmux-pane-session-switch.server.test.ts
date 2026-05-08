import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { switchTmuxPaneSession } from "./tmux-pane-session-switch.server";

const originalPath = process.env.PATH ?? "";
const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-pane-switch-"));
  tempRoots.push(root);
  mkdirSync(join(root, "bin"), { recursive: true });
  return root;
}

function installFakeCommands(root: string): string {
  const logPath = join(root, "commands.log");

  writeFileSync(
    join(root, "bin", "tmux"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'tmux %s\n' "$*" >> "${logPath}"
`,
    { encoding: "utf-8", mode: 0o755 }
  );

  writeFileSync(
    join(root, "bin", "sleep"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'sleep %s\n' "$*" >> "${logPath}"
`,
    { encoding: "utf-8", mode: 0o755 }
  );

  process.env.PATH = `${join(root, "bin")}:${originalPath}`;
  return logPath;
}

afterEach(() => {
  process.env.PATH = originalPath;

  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("switchTmuxPaneSession", () => {
  it("waits between tmux inputs so the session switch command is fully applied", () => {
    const root = createTempRoot();
    const logPath = installFakeCommands(root);

    switchTmuxPaneSession({
      agentId: "ignis",
      root,
      sessionTitle: "mission:mission-123:ignis",
    });

    expect(readFileSync(logPath, "utf-8").trim().split("\n")).toEqual([
      "tmux send-keys -t ff15:main.1 C-p",
      "sleep 0.5",
      "tmux send-keys -t ff15:main.1 -l Switch session",
      "sleep 0.5",
      "tmux send-keys -t ff15:main.1 Enter",
      "sleep 0.5",
      "tmux send-keys -t ff15:main.1 -l mission:mission-123:ignis",
      "sleep 0.5",
      "tmux send-keys -t ff15:main.1 Enter",
    ]);
  });
});

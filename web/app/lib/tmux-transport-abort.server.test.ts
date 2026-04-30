import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  interruptManagedTmuxSession,
  requestTmuxDispatchAbortForSession,
  TMUX_TRANSPORT_ABORT_REQUEST_DIR,
  TMUX_TRANSPORT_CURRENT_DISPATCH_FILE,
} from "./tmux-transport-abort.server";

const originalPath = process.env.PATH ?? "";
const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-tmux-abort-"));
  tempRoots.push(root);
  mkdirSync(join(root, "runtime"), { recursive: true });
  mkdirSync(join(root, "bin"), { recursive: true });
  return root;
}

function writeExecutable(path: string, content: string): void {
  writeFileSync(path, content, { encoding: "utf-8", mode: 0o755 });
}

function installFakeTmux(root: string): string {
  const binDir = join(root, "bin");
  const logPath = join(root, "tmux.log");
  writeExecutable(
    join(binDir, "tmux"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${logPath}"
`,
  );
  process.env.PATH = `${binDir}:${originalPath}`;
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

describe("tmux transport abort helper", () => {
  it("writes an abort request when the current dispatch matches the managed session", () => {
    const root = createTempRoot();
    writeFileSync(
      join(root, "runtime", TMUX_TRANSPORT_CURRENT_DISPATCH_FILE),
      `${JSON.stringify(
        {
          agent: "ignis",
          itemId: "item-1",
          missionId: "mission-1",
          phase: "switch-model",
          sessionId: "session-1",
          target: "ff15:main.1",
          updatedAt: "2026-04-30T10:00:00.000Z",
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const result = requestTmuxDispatchAbortForSession({
      missionId: "mission-1",
      requestedAt: "2026-04-30T10:00:05.000Z",
      requestedBy: "abort-route",
      root,
      sessionId: "session-1",
    });

    expect(result).toEqual({
      currentDispatch: expect.objectContaining({
        itemId: "item-1",
        phase: "switch-model",
      }),
      requested: true,
    });

    const abortRequestPath = join(
      root,
      "runtime",
      TMUX_TRANSPORT_ABORT_REQUEST_DIR,
      "session-1.json",
    );
    expect(existsSync(abortRequestPath)).toBe(true);
    expect(JSON.parse(readFileSync(abortRequestPath, "utf-8"))).toEqual({
      missionId: "mission-1",
      requestedAt: "2026-04-30T10:00:05.000Z",
      requestedBy: "abort-route",
      sessionId: "session-1",
    });
  });

  it("ignores abort requests for other managed sessions", () => {
    const root = createTempRoot();
    writeFileSync(
      join(root, "runtime", TMUX_TRANSPORT_CURRENT_DISPATCH_FILE),
      `${JSON.stringify(
        {
          agent: "ignis",
          itemId: "item-2",
          missionId: "mission-2",
          phase: "typing-payload",
          sessionId: "session-2",
          target: "ff15:main.1",
          updatedAt: "2026-04-30T10:01:00.000Z",
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const result = requestTmuxDispatchAbortForSession({
      missionId: "mission-1",
      requestedBy: "abort-route",
      root,
      sessionId: "session-1",
    });

    expect(result).toEqual({
      currentDispatch: expect.objectContaining({ itemId: "item-2" }),
      requested: false,
    });
    expect(
      existsSync(join(root, "runtime", TMUX_TRANSPORT_ABORT_REQUEST_DIR, "session-1.json")),
    ).toBe(false);
  });

  it("sends Escape to the owner pane for active tmux-managed responses", () => {
    const root = createTempRoot();
    const logPath = installFakeTmux(root);

    interruptManagedTmuxSession({
      method: "escape",
      ownerAgent: "prompto",
      root,
    });

    expect(readFileSync(logPath, "utf-8").trim()).toBe("send-keys -t ff15:main.3 Escape");
  });

  it("sends Escape to the Lunafreya pane for active tmux-managed responses", () => {
    const root = createTempRoot();
    const logPath = installFakeTmux(root);

    interruptManagedTmuxSession({
      method: "escape",
      ownerAgent: "lunafreya",
      root,
    });

    expect(readFileSync(logPath, "utf-8").trim()).toBe("send-keys -t ff15:main.4 Escape");
  });
});
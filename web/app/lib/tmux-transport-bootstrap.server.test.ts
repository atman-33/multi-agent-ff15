import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getTmuxTransportBootstrapStatus } from "./tmux-transport-bootstrap.server";

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-tmux-bootstrap-"));
  mkdirSync(join(root, "runtime"), { recursive: true });
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("tmux-transport-bootstrap.server", () => {
  it("reports tmux transport as unhealthy when the endpoint manifest is missing", async () => {
    const root = createTempRoot();

    const status = await getTmuxTransportBootstrapStatus(root);

    expect(status).toMatchObject({
      error: expect.stringContaining("opencode-endpoints.json"),
      isReady: false,
    });
  });

  it("reports tmux transport as unhealthy when the dispatcher state is missing", async () => {
    const root = createTempRoot();

    writeFileSync(
      join(root, "runtime", "opencode-endpoints.json"),
      `${JSON.stringify(
        {
          version: 1,
          startedAt: "2026-04-27T00:00:00.000Z",
          agents: [
            {
              agentId: "noctis",
              port: 4401,
              url: "http://127.0.0.1:4401",
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const status = await getTmuxTransportBootstrapStatus(root);

    expect(status).toMatchObject({
      dispatcherState: "missing",
      error: expect.stringContaining("tmux-transport-dispatcher.json"),
      isReady: false,
    });
  });

  it("accepts a healthy dispatcher state file that includes runtime queue metadata", async () => {
    const root = createTempRoot();

    writeFileSync(join(root, "opencode.json"), JSON.stringify({ mcp: { alpha: { enabled: true } } }), "utf-8");

    writeFileSync(
      join(root, "runtime", "opencode-endpoints.json"),
      `${JSON.stringify(
        {
          version: 1,
          startedAt: "2026-04-27T00:00:00.000Z",
          agents: [
            {
              agentId: "noctis",
              port: 4401,
              url: "http://127.0.0.1:4401",
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    writeFileSync(
      join(root, "runtime", "tmux-transport-dispatcher.json"),
      `${JSON.stringify(
        {
          version: 1,
          owner: "standby",
          mode: "tmux-resident",
          pid: process.pid,
          startedAt: "2026-04-27T00:00:00.000Z",
          processedCount: 2,
          queuedCount: 1,
          lastActivityAt: "2026-04-27T00:01:00.000Z",
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const status = await getTmuxTransportBootstrapStatus(root);

    expect(status).toMatchObject({
      agentCount: 1,
      dispatcherPid: process.pid,
      dispatcherState: "valid",
      endpointManifestState: "valid",
      error: null,
      isReady: true,
      restartRequired: false,
    });
  });

  it("marks the tmux transport for restart when opencode.json changed after startup", async () => {
    const root = createTempRoot();

    writeFileSync(join(root, "opencode.json"), JSON.stringify({ mcp: { alpha: { enabled: true } } }), "utf-8");
    writeFileSync(
      join(root, "runtime", "opencode-endpoints.json"),
      `${JSON.stringify(
        {
          version: 1,
          startedAt: "2026-04-27T00:00:00.000Z",
          agents: [
            {
              agentId: "noctis",
              port: 4401,
              url: "http://127.0.0.1:4401",
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    writeFileSync(
      join(root, "runtime", "tmux-transport-dispatcher.json"),
      `${JSON.stringify(
        {
          version: 1,
          owner: "standby",
          mode: "tmux-resident",
          pid: process.pid,
          startedAt: "2026-04-27T00:00:00.000Z",
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    writeFileSync(
      join(root, "runtime", "tmux-transport-config-state.json"),
      `${JSON.stringify(
        {
          version: 1,
          appliedConfigHash: "old-config-hash",
          updatedAt: "2026-04-27T00:00:00.000Z",
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const status = await getTmuxTransportBootstrapStatus(root);

    expect(status).toMatchObject({
      dispatcherPid: process.pid,
      error: null,
      isReady: true,
      restartRequired: true,
      warning: expect.stringContaining("restart"),
    });
  });
});
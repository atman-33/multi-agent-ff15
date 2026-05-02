import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { action, loader } from "./api.mcp-config";

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-api-mcp-config-"));
  tempRoots.push(root);

  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "runtime"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(
    join(root, "config", "settings.yaml"),
    ['language: "en"', 'transport_mode: "tmux-resident"', 'shared_skills_root: "skills"', ""].join(
      "\n",
    ),
    "utf-8",
  );
  writeFileSync(
    join(root, "opencode.json"),
    `${JSON.stringify(
      {
        mcp: {
          alpha: {
            enabled: true,
            type: "local",
            command: ["alpha-mcp"],
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
  writeFileSync(
    join(root, "runtime", "opencode-endpoints.json"),
    `${JSON.stringify(
      {
        version: 1,
        startedAt: "2026-05-02T00:00:00.000Z",
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
        startedAt: "2026-05-02T00:00:00.000Z",
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  return root;
}

afterEach(() => {
  if (originalRootEnv === undefined) {
    delete process.env.MULTI_AGENT_FF15_ROOT;
  } else {
    process.env.MULTI_AGENT_FF15_ROOT = originalRootEnv;
  }

  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("api.mcp-config", () => {
  it("marks the tmux transport as restart-required after updating opencode.json", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const response = await action({
      request: new Request("http://localhost/api/mcp-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false, name: "alpha" }),
      }),
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      transportStatus: {
        bootstrapStatus: {
          restartRequired: true,
        },
        transportMode: "tmux-resident",
      },
    });

    const refreshed = await loader();
    await expect(refreshed.json()).resolves.toMatchObject({
      config: {
        mcp: {
          alpha: {
            enabled: false,
          },
        },
      },
      transportStatus: {
        bootstrapStatus: {
          restartRequired: true,
        },
      },
    });

    const savedConfig = readFileSync(join(root, "opencode.json"), "utf-8");
    expect(savedConfig).toContain('"enabled": false');
  });
});
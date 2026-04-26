import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getWebServerStatus, writeWebServerRecord } from "./web-server";

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-web-server-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "runtime"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
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
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("web-server runtime record", () => {
  it("persists the active web server origin in runtime/web-server.json", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeWebServerRecord(
      {
        mode: "production",
        pid: 4321,
        port: 13000,
        startedAt: "2026-04-25T00:00:00.000Z",
        url: "http://127.0.0.1:13000",
      },
      root,
    );

    const saved = JSON.parse(readFileSync(join(root, "runtime", "web-server.json"), "utf-8"));

    expect(saved).toMatchObject({
      mode: "production",
      pid: 4321,
      port: 13000,
      projectRoot: root,
      url: "http://127.0.0.1:13000",
      version: 1,
    });
  });

  it("reports the runtime origin when a matching live process is recorded", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeWebServerRecord(
      {
        mode: "development",
        pid: process.pid,
        port: 5173,
        startedAt: "2026-04-25T00:00:00.000Z",
        url: "http://127.0.0.1:5173",
      },
      root,
    );

    await expect(getWebServerStatus(root)).resolves.toMatchObject({
      pid: process.pid,
      state: "running",
      url: "http://127.0.0.1:5173",
    });
  });
});

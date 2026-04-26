import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-noctis-runtime-debug-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
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

describe("noctis-mission-runtime-debug.server", () => {
  it("appends sanitized runtime debug events under logs", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const module = await import("./noctis-mission-runtime-debug.server");

    module.appendNoctisMissionRuntimeDebugLog({
      source: "client-hook",
      event: "session-history-sync",
      stage: "failed",
      missionId: "mission-debug-1",
      sessionId: "session-debug-1",
      payload: {
        reason: "primary-idle-event",
        error: new Error("x".repeat(5000)),
      },
    });

    const written = readFileSync(module.getNoctisMissionRuntimeDebugLogPath(), "utf-8")
      .trim()
      .split(/\r?\n/);
    expect(written).toHaveLength(1);

    const parsed = JSON.parse(written[0] ?? "{}");
    expect(parsed).toMatchObject({
      source: "client-hook",
      event: "session-history-sync",
      stage: "failed",
      missionId: "mission-debug-1",
      sessionId: "session-debug-1",
      payload: {
        reason: "primary-idle-event",
        error: {
          name: "Error",
        },
      },
    });
    expect(String(parsed.payload.error.message)).toContain("[truncated");
  });
});
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { APP_ROOT_EXECUTION_PROJECT_ID } from "./execution-context";
import { readSessionExecutionContext, saveSessionExecutionContext } from "./session-execution-context.server";

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-session-execution-context-"));
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
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("session execution context store", () => {
  it("treats sessions without sidecar state as app-root sessions", () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    expect(readSessionExecutionContext("session-legacy")).toEqual({
      contextProjectIds: [],
      executionProjectId: APP_ROOT_EXECUTION_PROJECT_ID,
      updatedAt: null,
    });
  });

  it("persists stable-deduped context projects without repeating the execution project", () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const entry = saveSessionExecutionContext("session-1", {
      contextProjectIds: ["beta", "alpha", "beta", "gamma"],
      executionProjectId: "alpha",
    });

    expect(entry.executionProjectId).toBe("alpha");
    expect(entry.contextProjectIds).toEqual(["beta", "gamma"]);
    expect(entry.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(readSessionExecutionContext("session-1")).toEqual(entry);
  });
});
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

import { getProjectRoot } from "./get-project-root.server";

const tempRoots: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-web-project-root-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{"name":"multi-agent-ff15-web-test"}\n', "utf-8");
  return root;
}

afterEach(() => {
  process.env.MULTI_AGENT_FF15_ROOT = originalRootEnv;

  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

it("accepts scripts plus package.json when opencode.json is absent", () => {
  const root = createTempRoot();
  process.env.MULTI_AGENT_FF15_ROOT = root;

  expect(getProjectRoot()).toBe(root);
});
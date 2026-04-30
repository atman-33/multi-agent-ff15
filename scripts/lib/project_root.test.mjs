import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveProjectRoot } from "./project_root.mjs";

const tempRoots = [];

function createTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-project-root-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{"name":"multi-agent-ff15-test"}\n', "utf-8");
  return root;
}

test.afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("accepts scripts plus package.json when opencode.json is absent", () => {
  const root = createTempRoot();

  assert.equal(
    resolveProjectRoot({ ...process.env, MULTI_AGENT_FF15_ROOT: root }),
    root,
  );
});
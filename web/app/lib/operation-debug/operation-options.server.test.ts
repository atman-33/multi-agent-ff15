import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listOperationDebugOptions,
  resolveOperationDebugLanguage,
} from "./operation-options.server";

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];

function createTempRoot(language: string): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-operation-debug-options-"));
  tempRoots.push(root);

  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  writeFileSync(join(root, "config", "settings.yaml"), `language: ${language}\n`, "utf-8");

  return root;
}

function writeOperation(root: string, language: string, name: string, description: string): void {
  const operationsDirectory = join(root, "builtins", language, "operations");
  mkdirSync(operationsDirectory, { recursive: true });
  writeFileSync(
    join(operationsDirectory, `${name}.yaml`),
    [
      `name: ${name}`,
      `description: ${description}`,
      "initial_step: plan",
      "steps:",
      "  - name: plan",
      "    agent: noctis",
      "    job:",
      "      inline: Planner",
      "    instruction:",
      "      inline: Execute the plan",
      "    rules: []",
      "",
    ].join("\n"),
    "utf-8",
  );
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }

  if (originalRootEnv === undefined) {
    delete process.env.MULTI_AGENT_FF15_ROOT;
  } else {
    process.env.MULTI_AGENT_FF15_ROOT = originalRootEnv;
  }
});

describe("operation-debug operation options", () => {
  it("uses ja operations when language is ja", () => {
    const root = createTempRoot("ja");
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeOperation(root, "ja", "openspec-dev", "OpenSpec delivery flow.");
    writeOperation(root, "ja", "noctis-autonomous", "Default conversational flow.");

    expect(resolveOperationDebugLanguage()).toBe("ja");
    expect(listOperationDebugOptions().map((operation) => operation.value)).toEqual([
      "noctis-autonomous",
      "openspec-dev",
    ]);
  });

  it("uses only en operations when language is en and en builtins exist", () => {
    const root = createTempRoot("en");
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeOperation(root, "ja", "openspec-dev", "Japanese workflow.");
    writeOperation(root, "en", "noctis-autonomous", "Default conversational flow.");
    writeOperation(root, "en", "english-review", "English review workflow.");

    expect(resolveOperationDebugLanguage()).toBe("en");
    expect(listOperationDebugOptions().map((operation) => operation.value)).toEqual([
      "noctis-autonomous",
      "english-review",
    ]);
  });

  it("falls back to ja when language is en but en builtins are unavailable", () => {
    const root = createTempRoot("en");
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeOperation(root, "ja", "openspec-dev", "OpenSpec delivery flow.");
    writeOperation(root, "ja", "noctis-autonomous", "Default conversational flow.");

    expect(resolveOperationDebugLanguage()).toBe("ja");
    expect(listOperationDebugOptions().map((operation) => operation.value)).toEqual([
      "noctis-autonomous",
      "openspec-dev",
    ]);
  });
});
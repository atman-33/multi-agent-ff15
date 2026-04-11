import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { readSessionContextUsage } from "./session-context.server";

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-session-context-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  mkdirSync(join(root, "runtime", "session-context"), { recursive: true });
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

describe("readSessionContextUsage", () => {
  it("returns budget and window separately for new snapshots", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeFileSync(
      join(root, "runtime", "session-context", "session-new.json"),
      `${JSON.stringify(
        {
          calculatedAt: "2026-04-11T00:00:00.000Z",
          limitTokens: 128000,
          modelID: "claude-haiku-4.5",
          providerID: "github-copilot",
          remainingPercentage: 0.75,
          remainingTokens: 96000,
          tokenBreakdown: {
            cacheRead: 8000,
            cacheWrite: 0,
            input: 24000,
            output: 1000,
            reasoning: 0,
            total: 33000,
          },
          usedPercentage: 0.25,
          usedTokens: 32000,
          windowTokens: 144000,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    expect(readSessionContextUsage("session-new")).toEqual({
      calculatedAt: "2026-04-11T00:00:00.000Z",
      limitTokens: 128000,
      modelID: "claude-haiku-4.5",
      providerID: "github-copilot",
      remainingPercentage: 0.75,
      remainingTokens: 96000,
      tokenBreakdown: {
        cacheRead: 8000,
        cacheWrite: 0,
        input: 24000,
        output: 1000,
        reasoning: 0,
        total: 33000,
      },
      usedPercentage: 0.25,
      usedTokens: 32000,
      windowTokens: 144000,
    });
  });

  it("treats legacy limitTokens as the window fallback", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeFileSync(
      join(root, "runtime", "session-context", "session-legacy.json"),
      `${JSON.stringify(
        {
          calculatedAt: "2026-04-11T00:00:00.000Z",
          limitTokens: 200000,
          modelID: "gpt-5.4",
          providerID: "github-copilot",
          remainingPercentage: 0.5,
          remainingTokens: 100000,
          tokenBreakdown: {
            cacheRead: 5000,
            cacheWrite: 0,
            input: 95000,
            output: 1200,
            reasoning: 0,
            total: 101200,
          },
          usedPercentage: 0.5,
          usedTokens: 100000,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    expect(readSessionContextUsage("session-legacy")).toMatchObject({
      limitTokens: 200000,
      usedTokens: 100000,
      windowTokens: 200000,
    });
  });
});
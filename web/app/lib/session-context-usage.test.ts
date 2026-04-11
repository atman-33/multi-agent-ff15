import { describe, expect, it } from "vitest";

import { resolveSessionContextLimits } from "./session-context-usage";

describe("resolveSessionContextLimits", () => {
  it("uses input as the budget limit and context as the window", () => {
    expect(
      resolveSessionContextLimits(
        [
          {
            id: "github-copilot",
            models: {
              "claude-haiku-4.5": {
                id: "claude-haiku-4.5",
                limit: {
                  context: 144_000,
                  input: 128_000,
                  output: 32_000,
                },
              },
            },
          },
        ],
        { modelID: "claude-haiku-4.5", providerID: "github-copilot" },
      ),
    ).toEqual({
      limitTokens: 128_000,
      windowTokens: 144_000,
    });
  });

  it("preserves previously persisted limits when metadata is unavailable", () => {
    expect(
      resolveSessionContextLimits(
        [],
        { modelID: "qwen3.6-plus-free", providerID: "opencode" },
        { limitTokens: 200_000, windowTokens: 200_000 },
      ),
    ).toEqual({
      limitTokens: 200_000,
      windowTokens: 200_000,
    });
  });

  it("falls back to context when input is unavailable", () => {
    expect(
      resolveSessionContextLimits(
        [
          {
            id: "opencode",
            models: {
              "minimax-m2.5-free": {
                id: "minimax-m2.5-free",
                limit: {
                  context: 204_800,
                  output: 131_072,
                },
              },
            },
          },
        ],
        { modelID: "minimax-m2.5-free", providerID: "opencode" },
      ),
    ).toEqual({
      limitTokens: 204_800,
      windowTokens: 204_800,
    });
  });
});
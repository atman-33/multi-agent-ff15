import { describe, expect, it } from "vitest";
import {
  areModelSelectionsEqual,
  parseModelReference,
  splitModelSelection,
} from "./model-variant-selection";

describe("model-variant-selection helpers", () => {
  it("parses optional variants from config model references", () => {
    expect(parseModelReference("github-copilot/gpt-5.4", "high")).toEqual({
      providerID: "github-copilot",
      modelID: "gpt-5.4",
      variant: "high",
    });
  });

  it("treats variant as part of model equality", () => {
    expect(
      areModelSelectionsEqual(
        { providerID: "github-copilot", modelID: "gpt-5.4", variant: "high" },
        { providerID: "github-copilot", modelID: "gpt-5.4", variant: "medium" },
      ),
    ).toBe(false);
  });

  it("splits a selection into v2 model and variant fields", () => {
    expect(
      splitModelSelection({
        providerID: "github-copilot",
        modelID: "gpt-5.4",
        variant: "high",
      }),
    ).toEqual({
      model: {
        providerID: "github-copilot",
        modelID: "gpt-5.4",
      },
      variant: "high",
    });
  });
});
import { describe, expect, it } from "vitest";
import {
  areModelSelectionsEqual,
  buildModelSelection,
  getExplicitVariantOptions,
  parseModelReference,
  splitModelSelection,
} from "./model-variant-selection";

describe("model-variant-selection helpers", () => {
  it("keeps stale current variants while hiding the default sentinel from explicit options", () => {
    expect(
      getExplicitVariantOptions("github-copilot/gpt-5.4", "legacy", {
        "github-copilot/gpt-5.4": ["medium", "high"],
      })
    ).toEqual([
      { label: "legacy (current)", unavailable: true, value: "legacy" },
      { label: "medium", value: "medium" },
      { label: "high", value: "high" },
    ]);
  });

  it("builds an unset selection when no explicit variant is provided", () => {
    expect(
      buildModelSelection({ providerID: "github-copilot", modelID: "gpt-5.4" })
    ).toEqual({
      providerID: "github-copilot",
      modelID: "gpt-5.4",
    });

    expect(
      buildModelSelection(
        { providerID: "github-copilot", modelID: "gpt-5.4" },
        "high"
      )
    ).toEqual({
      providerID: "github-copilot",
      modelID: "gpt-5.4",
      variant: "high",
    });
  });

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
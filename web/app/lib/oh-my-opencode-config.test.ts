import { describe, expect, it } from "vitest";
import {
  DEFAULT_VARIANT_VALUE,
  getModelSelectionFromEntry,
  getVariantOptions,
  isVariantSelectionDisabled,
  updateConfigPickerSelection,
  updateConfigModelSelection,
  updateConfigVariantSelection,
  type OhMyOpenCodeConfig,
} from "./oh-my-opencode-config";

describe("oh-my-opencode-config helpers", () => {
  it("preserves the current variant when the next model supports it", () => {
    const config: OhMyOpenCodeConfig = {
      agents: {
        oracle: {
          model: "github-copilot/gpt-5.4",
          variant: "high",
        },
      },
    };

    expect(
      updateConfigModelSelection(config, "agents", "oracle", "github-copilot/gpt-5.5", {
        "github-copilot/gpt-5.5": ["medium", "high"],
      })
    ).toEqual({
      agents: {
        oracle: {
          model: "github-copilot/gpt-5.5",
          variant: "high",
        },
      },
    });
  });

  it("resets the current variant when the next model does not support it", () => {
    const config: OhMyOpenCodeConfig = {
      categories: {
        deep: {
          model: "github-copilot/gpt-5.4",
          variant: "xhigh",
        },
      },
    };

    expect(
      updateConfigModelSelection(config, "categories", "deep", "github-copilot/claude-haiku-4.5", {
        "github-copilot/claude-haiku-4.5": [],
      })
    ).toEqual({
      categories: {
        deep: {
          model: "github-copilot/claude-haiku-4.5",
        },
      },
    });
  });

  it("keeps the current unknown variant visible alongside the default option", () => {
    expect(
      getVariantOptions("github-copilot/gpt-5.4", "legacy", {
        "github-copilot/gpt-5.4": ["medium", "high"],
      })
    ).toEqual([
      { label: "Default", value: DEFAULT_VARIANT_VALUE },
      { label: "legacy (current)", unavailable: true, value: "legacy" },
      { label: "medium", value: "medium" },
      { label: "high", value: "high" },
    ]);
  });

  it("disables variant selection when a model has no variants", () => {
    expect(
      isVariantSelectionDisabled("github-copilot/claude-haiku-4.5", undefined, {
        "github-copilot/claude-haiku-4.5": [],
      })
    ).toBe(true);
  });

  it("removes the variant when the default option is selected", () => {
    const config: OhMyOpenCodeConfig = {
      agents: {
        sisyphus: {
          model: "github-copilot/gpt-5.4",
          variant: "medium",
        },
      },
    };

    expect(updateConfigVariantSelection(config, "agents", "sisyphus", DEFAULT_VARIANT_VALUE)).toEqual({
      agents: {
        sisyphus: {
          model: "github-copilot/gpt-5.4",
        },
      },
    });
  });

  it("parses a config entry into a shared picker selection", () => {
    expect(
      getModelSelectionFromEntry({
        model: "github-copilot/gpt-5.4",
        variant: "high",
      })
    ).toEqual({
      providerID: "github-copilot",
      modelID: "gpt-5.4",
      variant: "high",
    });
  });

  it("clears the current variant when picker auto-selection is applied", () => {
    const config: OhMyOpenCodeConfig = {
      agents: {
        oracle: {
          model: "github-copilot/gpt-5.4",
          variant: "high",
        },
      },
    };

    expect(
      updateConfigPickerSelection(
        config,
        "agents",
        "oracle",
        {
          providerID: "github-copilot",
          modelID: "gpt-5.4",
        },
        {
          "github-copilot/gpt-5.4": ["medium", "high"],
        }
      )
    ).toEqual({
      agents: {
        oracle: {
          model: "github-copilot/gpt-5.4",
        },
      },
    });
  });
});
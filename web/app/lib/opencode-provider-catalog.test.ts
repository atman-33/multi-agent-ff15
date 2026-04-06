import { describe, expect, it } from "vitest";
import { flattenProviderModels, type OpencodeProvider } from "./opencode-provider-catalog";

describe("opencode-provider-catalog", () => {
  it("preserves provider order while sorting models within each provider by name", () => {
    const providers: OpencodeProvider[] = [
      {
        id: "github-copilot",
        name: "GitHub Copilot",
        models: {
          "zeta-model": { id: "zeta-model", name: "Zeta" },
          "alpha-model": { id: "alpha-model", name: "Alpha" },
          "alpha-model-2": { id: "alpha-model-2", name: "Alpha" },
        },
      },
      {
        id: "zen",
        name: "Zen",
        models: {
          "omega-model": { id: "omega-model", name: "Omega" },
          "beta-model": { id: "beta-model", name: "Beta" },
        },
      },
    ];

    expect(flattenProviderModels(providers)).toEqual([
      {
        providerID: "github-copilot",
        providerName: "GitHub Copilot",
        modelID: "alpha-model",
        modelName: "Alpha",
      },
      {
        providerID: "github-copilot",
        providerName: "GitHub Copilot",
        modelID: "alpha-model-2",
        modelName: "Alpha",
      },
      {
        providerID: "github-copilot",
        providerName: "GitHub Copilot",
        modelID: "zeta-model",
        modelName: "Zeta",
      },
      {
        providerID: "zen",
        providerName: "Zen",
        modelID: "beta-model",
        modelName: "Beta",
      },
      {
        providerID: "zen",
        providerName: "Zen",
        modelID: "omega-model",
        modelName: "Omega",
      },
    ]);
  });
});
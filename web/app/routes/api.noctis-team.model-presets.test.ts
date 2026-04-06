import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { providersMock, readOpencodeModelCatalogMock } = vi.hoisted(() => ({
  providersMock: vi.fn(),
  readOpencodeModelCatalogMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  getOpencodeClient: () => ({
    config: {
      providers: providersMock,
    },
  }),
}));

vi.mock("@/lib/opencode-model-catalog.server", () => ({
  readOpencodeModelCatalog: readOpencodeModelCatalogMock,
}));

import { loader } from "./api.noctis-team.model-presets";

const tempRoots: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(modelsYaml: string): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-model-presets-"));
  tempRoots.push(root);
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  writeFileSync(join(root, "config", "models.yaml"), modelsYaml, "utf-8");
  return root;
}

afterEach(() => {
  vi.clearAllMocks();

  if (originalRootEnv === undefined) {
    delete process.env.MULTI_AGENT_FF15_ROOT;
  } else {
    process.env.MULTI_AGENT_FF15_ROOT = originalRootEnv;
  }

  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("api.noctis-team.model-presets", () => {
  it("parses optional variant entries from config/models.yaml", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot([
      "modes:",
      "  balanced:",
      '    _description: "Balanced"',
      "    noctis:",
      '      model: "github-copilot/gpt-5.4"',
      '      variant: "high"',
      "    ignis:",
      '      model: "github-copilot/gpt-5.4"',
      "    gladiolus:",
      '      model: "github-copilot/gpt-5.4"',
      "    prompto:",
      '      model: "github-copilot/gpt-5.4"',
      "",
    ].join("\n"));

    providersMock.mockResolvedValue({
      data: {
        default: {},
        providers: [
          {
            id: "github-copilot",
            models: {
              "gpt-5.4": { id: "gpt-5.4" },
            },
          },
        ],
      },
    });
    readOpencodeModelCatalogMock.mockResolvedValue({
      lastError: null,
      refreshState: "ready",
      snapshot: {
        generatedAt: "2026-04-06T00:00:00.000Z",
        models: ["github-copilot/gpt-5.4"],
        opencodeVersion: "1.2.27",
        sourceCommand: "opencode models --verbose",
        variantsByModel: {
          "github-copilot/gpt-5.4": ["high"],
        },
      },
      stale: false,
    });

    const response = await loader();
    const data = (await response.json()) as {
      presets: Array<{
        available: boolean;
        agentModels: Record<string, { modelID: string; providerID: string; variant?: string }>;
      }>;
    };

    expect(data.presets[0]?.available).toBe(true);
    expect(data.presets[0]?.agentModels.noctis).toEqual({
      providerID: "github-copilot",
      modelID: "gpt-5.4",
      variant: "high",
    });
  });

  it("marks presets unavailable when the configured variant is stale", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot([
      "modes:",
      "  balanced:",
      '    _description: "Balanced"',
      "    noctis:",
      '      model: "github-copilot/gpt-5.4"',
      '      variant: "legacy"',
      "    ignis:",
      '      model: "github-copilot/gpt-5.4"',
      "    gladiolus:",
      '      model: "github-copilot/gpt-5.4"',
      "    prompto:",
      '      model: "github-copilot/gpt-5.4"',
      "",
    ].join("\n"));

    providersMock.mockResolvedValue({
      data: {
        default: {},
        providers: [
          {
            id: "github-copilot",
            models: {
              "gpt-5.4": { id: "gpt-5.4" },
            },
          },
        ],
      },
    });
    readOpencodeModelCatalogMock.mockResolvedValue({
      lastError: null,
      refreshState: "ready",
      snapshot: {
        generatedAt: "2026-04-06T00:00:00.000Z",
        models: ["github-copilot/gpt-5.4"],
        opencodeVersion: "1.2.27",
        sourceCommand: "opencode models --verbose",
        variantsByModel: {
          "github-copilot/gpt-5.4": ["high"],
        },
      },
      stale: false,
    });

    const response = await loader();
    const data = (await response.json()) as {
      presets: Array<{ available: boolean; unavailableAgents: string[] }>;
    };

    expect(data.presets[0]).toMatchObject({
      available: false,
      unavailableAgents: ["noctis"],
    });
  });
});
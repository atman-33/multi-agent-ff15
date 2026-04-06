import { describe, expect, it, vi } from "vitest";

const { readOhMyOpenCodeDataMock, writeOhMyOpenCodeConfigMock } = vi.hoisted(() => ({
  readOhMyOpenCodeDataMock: vi.fn(),
  writeOhMyOpenCodeConfigMock: vi.fn(),
}));

vi.mock("@/lib/oh-my-opencode-config.server", () => ({
  readOhMyOpenCodeData: readOhMyOpenCodeDataMock,
  writeOhMyOpenCodeConfig: writeOhMyOpenCodeConfigMock,
}));

import { action, loader } from "./api.oh-my-opencode.config";

describe("api.oh-my-opencode.config", () => {
  it("returns the latest catalog payload when refresh is requested", async () => {
    readOhMyOpenCodeDataMock.mockResolvedValueOnce({
      catalog: {
        generatedAt: "2026-04-05T00:00:00.000Z",
        refreshState: "ready",
        stale: false,
      },
      config: {
        agents: {
          oracle: {
            model: "github-copilot/gpt-5.4",
            variant: "high",
          },
        },
      },
      isInstalled: true,
      models: ["github-copilot/gpt-5.4"],
      providers: [
        {
          id: "github-copilot",
          name: "GitHub Copilot",
          models: {
            "gpt-5.4": {
              id: "gpt-5.4",
              name: "GPT-5.4",
            },
          },
        },
      ],
      variantsByModel: {
        "github-copilot/gpt-5.4": ["medium", "high"],
      },
      version: "1.2.3",
    });

    const response = await loader({
      request: new Request("http://localhost/api/oh-my-opencode/config?refresh=1"),
    } as never);

    expect(readOhMyOpenCodeDataMock).toHaveBeenCalledWith({ refreshCatalog: true });
    await expect(response.json()).resolves.toMatchObject({
      catalog: {
        refreshState: "ready",
      },
      models: ["github-copilot/gpt-5.4"],
      providers: [
        {
          id: "github-copilot",
          name: "GitHub Copilot",
        },
      ],
      variantsByModel: {
        "github-copilot/gpt-5.4": ["medium", "high"],
      },
    });
  });

  it("writes config updates through the server helper", async () => {
    const config = {
      categories: {
        deep: {
          model: "github-copilot/gpt-5.4",
          variant: "medium",
        },
      },
    };

    const response = await action({
      request: new Request("http://localhost/api/oh-my-opencode/config", {
        body: JSON.stringify({ config }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    } as never);

    expect(writeOhMyOpenCodeConfigMock).toHaveBeenCalledWith(config);
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
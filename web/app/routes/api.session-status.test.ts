import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  defaultStatusMock,
  ignisStatusMock,
  listSessionStatusTargetsMock,
  lunaStatusMock,
} = vi.hoisted(() => ({
  defaultStatusMock: vi.fn(),
  ignisStatusMock: vi.fn(),
  listSessionStatusTargetsMock: vi.fn(),
  lunaStatusMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  getOpencodeClient: () => ({
    session: {
      status: defaultStatusMock,
    },
  }),
}));

vi.mock("@/lib/session-owner-routing.server", () => ({
  listSessionStatusTargets: listSessionStatusTargetsMock,
}));

import { loader } from "./api.session-status";

describe("api.session-status", () => {
  beforeEach(() => {
    listSessionStatusTargetsMock.mockReturnValue([]);
  });

  afterEach(() => {
    defaultStatusMock.mockReset();
    ignisStatusMock.mockReset();
    listSessionStatusTargetsMock.mockReset();
    lunaStatusMock.mockReset();
  });

  it("falls back to the default OpenCode client when no tmux status targets are available", async () => {
    defaultStatusMock.mockResolvedValue({
      data: {
        "session-default": "busy",
      },
    });

    const response = await loader();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      statuses: {
        "session-default": "busy",
      },
    });
  });

  it("aggregates session statuses across resolved tmux agent endpoints", async () => {
    defaultStatusMock.mockRejectedValue(new Error("default client should not be used"));
    ignisStatusMock.mockResolvedValue({
      data: {
        "session-ignis": "busy",
      },
    });
    lunaStatusMock.mockResolvedValue({
      data: {
        "session-luna": "idle",
      },
    });
    listSessionStatusTargetsMock.mockReturnValue([
      {
        agentId: "ignis",
        client: {
          session: {
            status: ignisStatusMock,
          },
        },
        endpointUrl: "http://127.0.0.1:4403",
      },
      {
        agentId: "lunafreya",
        client: {
          session: {
            status: lunaStatusMock,
          },
        },
        endpointUrl: "http://127.0.0.1:4402",
      },
    ]);

    const response = await loader();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      statuses: {
        "session-ignis": "busy",
        "session-luna": "idle",
      },
    });
  });

  it("preserves the statuses response envelope when one endpoint fails", async () => {
    defaultStatusMock.mockRejectedValue(new Error("default client should not be used"));
    ignisStatusMock.mockRejectedValue(new Error("ignis unavailable"));
    lunaStatusMock.mockResolvedValue({
      data: {
        "session-luna": "busy",
      },
    });
    listSessionStatusTargetsMock.mockReturnValue([
      {
        agentId: "ignis",
        client: {
          session: {
            status: ignisStatusMock,
          },
        },
        endpointUrl: "http://127.0.0.1:4403",
      },
      {
        agentId: "lunafreya",
        client: {
          session: {
            status: lunaStatusMock,
          },
        },
        endpointUrl: "http://127.0.0.1:4402",
      },
    ]);

    const response = await loader();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      statuses: {
        "session-luna": "busy",
      },
    });
  });
});
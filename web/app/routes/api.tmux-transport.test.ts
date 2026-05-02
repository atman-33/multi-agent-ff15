import { beforeEach, describe, expect, it, vi } from "vitest";

const { restartTmuxTransportMock } = vi.hoisted(() => ({
  restartTmuxTransportMock: vi.fn(),
}));

vi.mock("@/lib/tmux-transport-control.server", () => ({
  restartTmuxTransport: restartTmuxTransportMock,
}));

import { action } from "./api.tmux-transport";

beforeEach(() => {
  restartTmuxTransportMock.mockReset();
});

describe("api.tmux-transport", () => {
  it("restarts the tmux transport and returns the refreshed status", async () => {
    restartTmuxTransportMock.mockResolvedValue({
      bootstrapStatus: {
        agentCount: 6,
        configState: "valid",
        configStatePath: "/tmp/runtime/tmux-transport-config-state.json",
        dispatcherPid: 4321,
        dispatcherState: "valid",
        dispatcherStatePath: "/tmp/runtime/tmux-transport-dispatcher.json",
        endpointManifestPath: "/tmp/runtime/opencode-endpoints.json",
        endpointManifestState: "valid",
        error: null,
        isReady: true,
        lastStartedAt: "2026-05-02T00:00:00.000Z",
        restartRequired: false,
        warning: null,
      },
      error: null,
      isReady: true,
      transportMode: "tmux-resident",
    });

    const response = await action({
      request: new Request("http://localhost/api/tmux-transport", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "restart" }),
      }),
    } as never);

    expect(restartTmuxTransportMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      transportStatus: {
        isReady: true,
        transportMode: "tmux-resident",
      },
    });
  });

  it("returns 409 when tmux restart is unavailable in app-owned mode", async () => {
    restartTmuxTransportMock.mockRejectedValue(
      new Error("Tmux transport restart requires transport_mode=tmux-resident."),
    );

    const response = await action({
      request: new Request("http://localhost/api/tmux-transport", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "restart" }),
      }),
    } as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Tmux transport restart requires transport_mode=tmux-resident.",
    });
  });
});
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getOpencodeServerStatusMock, recoverOpencodeServerMock, forceRestartOpencodeServerMock } = vi.hoisted(() => ({
  getOpencodeServerStatusMock: vi.fn(),
  recoverOpencodeServerMock: vi.fn(),
  forceRestartOpencodeServerMock: vi.fn(),
}));

vi.mock("@/lib/opencode-server", () => ({
  forceRestartOpencodeServer: forceRestartOpencodeServerMock,
  getOpencodeServerStatus: getOpencodeServerStatusMock,
  recoverOpencodeServer: recoverOpencodeServerMock,
}));

import { action } from "./api.opencode-server";

beforeEach(() => {
  forceRestartOpencodeServerMock.mockReset();
  getOpencodeServerStatusMock.mockReset();
  recoverOpencodeServerMock.mockReset();
});

describe("api.opencode-server", () => {
  it("returns a 500 response when recovery is blocked by an unreclaimed app-owned process", async () => {
    recoverOpencodeServerMock.mockResolvedValue({
      checkedAt: "2026-04-08T00:00:00.000Z",
      error: "Failed to reclaim app-owned OpenCode server process 34567",
      foreignServerUrl: null,
      isRunning: false,
      lastStartedAt: "2026-04-08T00:00:00.000Z",
      managedByApp: true,
      recoveryBlocked: true,
      state: "down",
      url: "http://127.0.0.1:45100",
      warning: null,
    });

    const response = await action({
      request: new Request("http://localhost/api/opencode-server", {
        method: "POST",
      }),
    } as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "Failed to reclaim app-owned OpenCode server process 34567",
      recoveryBlocked: true,
      url: "http://127.0.0.1:45100",
    });
  });

  it("routes force-restart requests to the force-restart helper", async () => {
    forceRestartOpencodeServerMock.mockResolvedValue({
      checkedAt: "2026-04-12T00:00:00.000Z",
      error: null,
      foreignServerUrl: null,
      forceRestart: {
        availability: "available",
        reason: null,
      },
      isRunning: true,
      lastStartedAt: "2026-04-12T00:00:00.000Z",
      managedByApp: true,
      recoveryBlocked: false,
      state: "running",
      url: "http://127.0.0.1:45211",
      warning: null,
    });

    const response = await action({
      request: new Request("http://localhost/api/opencode-server", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "force-restart" }),
      }),
    } as never);

    expect(forceRestartOpencodeServerMock).toHaveBeenCalledTimes(1);
    expect(recoverOpencodeServerMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      isRunning: true,
      managedByApp: true,
      url: "http://127.0.0.1:45211",
    });
  });

  it("returns a 409 response when force restart is unavailable", async () => {
    forceRestartOpencodeServerMock.mockResolvedValue({
      checkedAt: "2026-04-12T00:00:00.000Z",
      error: "Force restart is available only for a running app-owned OpenCode server",
      foreignServerUrl: "http://127.0.0.1:4097",
      forceRestart: {
        availability: "unavailable",
        reason: "Force restart is available only for a running app-owned OpenCode server",
      },
      isRunning: false,
      lastStartedAt: null,
      managedByApp: false,
      recoveryBlocked: false,
      state: "down",
      url: null,
      warning: "Detected a healthy foreign OpenCode server at http://127.0.0.1:4097.",
    });

    const response = await action({
      request: new Request("http://localhost/api/opencode-server", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "force-restart" }),
      }),
    } as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Force restart is available only for a running app-owned OpenCode server",
      foreignServerUrl: "http://127.0.0.1:4097",
      isRunning: false,
    });
  });

  it("returns a 409 response when force restart metadata marks the action unavailable without a generic error", async () => {
    forceRestartOpencodeServerMock.mockResolvedValue({
      checkedAt: "2026-04-13T00:00:00.000Z",
      error: null,
      foreignServerUrl: null,
      forceRestart: {
        availability: "unavailable",
        reason: "Force restart is unavailable while the app-owned OpenCode server is starting.",
      },
      isRunning: false,
      lastStartedAt: "2026-04-13T00:00:00.000Z",
      managedByApp: true,
      recoveryBlocked: false,
      state: "starting",
      url: "http://127.0.0.1:45211",
      warning: null,
    });

    const response = await action({
      request: new Request("http://localhost/api/opencode-server", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "force-restart" }),
      }),
    } as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      forceRestart: {
        availability: "unavailable",
        reason: "Force restart is unavailable while the app-owned OpenCode server is starting.",
      },
      state: "starting",
    });
  });
});
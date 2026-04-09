import { describe, expect, it, vi } from "vitest";

const { getOpencodeServerStatusMock, recoverOpencodeServerMock } = vi.hoisted(() => ({
  getOpencodeServerStatusMock: vi.fn(),
  recoverOpencodeServerMock: vi.fn(),
}));

vi.mock("@/lib/opencode-server", () => ({
  getOpencodeServerStatus: getOpencodeServerStatusMock,
  recoverOpencodeServer: recoverOpencodeServerMock,
}));

import { action } from "./api.opencode-server";

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
});
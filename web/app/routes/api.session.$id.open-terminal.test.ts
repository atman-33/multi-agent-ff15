import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  execFileMock,
  resolveSessionRouteTargetMock,
  resolvedSessionListMock,
  sessionListMock,
} = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  resolveSessionRouteTargetMock: vi.fn(),
  resolvedSessionListMock: vi.fn(),
  sessionListMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

vi.mock("@/lib/get-project-root.server", () => ({
  getProjectRoot: () => "/workspace/root",
}));

vi.mock("@/lib/opencode-client", () => ({
  getOpencodeClient: () => ({
    session: {
      list: sessionListMock,
    },
  }),
}));

vi.mock("@/lib/session-owner-routing.server", () => ({
  resolveSessionRouteTarget: resolveSessionRouteTargetMock,
}));

import { action } from "./api.session.$id.open-terminal";

const originalDistro = process.env.WSL_DISTRO_NAME;

describe("api.session.$id.open-terminal", () => {
  beforeEach(() => {
    process.env.WSL_DISTRO_NAME = "Ubuntu";
    execFileMock.mockImplementation(
      (
        file: string,
        _args: string[],
        callback: (error: Error | null, stdout?: string, stderr?: string) => void,
      ) => {
        if (file === "bash") {
          callback(null, "/usr/bin/opencode\n", "");
          return;
        }

        callback(null, "", "");
      },
    );
    resolveSessionRouteTargetMock.mockImplementation(() => ({
      client: {
        session: {
          list: sessionListMock,
        },
      },
      endpointUrl: null,
      managedSession: null,
      mode: "default",
      ownerAgent: null,
    }));
  });

  afterEach(() => {
    execFileMock.mockReset();
    resolveSessionRouteTargetMock.mockReset();
    resolvedSessionListMock.mockReset();
    sessionListMock.mockReset();

    if (originalDistro === undefined) {
      delete process.env.WSL_DISTRO_NAME;
    } else {
      process.env.WSL_DISTRO_NAME = originalDistro;
    }
  });

  it("validates managed sessions through the resolved owner-aware client before launching the terminal", async () => {
    sessionListMock.mockRejectedValue(new Error("default client should not be used"));
    resolvedSessionListMock.mockResolvedValue({
      data: [
        {
          id: "session-managed",
          directory: "/workspace/root",
        },
      ],
    });
    resolveSessionRouteTargetMock.mockReturnValue({
      client: {
        session: {
          list: resolvedSessionListMock,
        },
      },
      endpointUrl: "http://127.0.0.1:4403",
      managedSession: {
        missionId: "mission-managed",
        ownerAgent: "ignis",
        ownerLabel: "Ignis",
      },
      mode: "managed",
      ownerAgent: "ignis",
    });

    const response = await action({ params: { id: "session-managed" } } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
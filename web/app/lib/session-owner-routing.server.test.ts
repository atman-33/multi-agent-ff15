import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createOpencodeClientMock } = vi.hoisted(() => ({
  createOpencodeClientMock: vi.fn((options: { baseUrl: string; directory: string }) => ({
    options,
  })),
}));

vi.mock("@opencode-ai/sdk/v2/client", () => ({
  createOpencodeClient: createOpencodeClientMock,
}));

vi.mock("./opencode-server", () => ({
  getOpencodeBaseUrl: () => "http://127.0.0.1:4096",
}));

import { createMission, deleteMission } from "./mission-store";
import { resolveSessionRouteTarget } from "./session-owner-routing.server";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-session-owner-routing-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "runtime"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

function writeEndpointManifest(
  root: string,
  agents: Array<{ agentId: string; port: number; url: string }>,
): void {
  writeFileSync(
    join(root, "runtime", "opencode-endpoints.json"),
    `${JSON.stringify(
      {
        version: 1,
        startedAt: "2026-04-28T00:00:00.000Z",
        agents,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
}

afterEach(() => {
  createOpencodeClientMock.mockClear();

  for (const missionId of missionIds.splice(0)) {
    deleteMission(missionId);
  }

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

describe("session-owner-routing.server", () => {
  it("resolves a managed tmux session to its owning agent endpoint", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    writeEndpointManifest(root, [
      {
        agentId: "lunafreya",
        port: 4402,
        url: "http://127.0.0.1:4402",
      },
    ]);

    const mission = createMission("managed-luna", "session-luna", {
      title: "Lunafreya Mission",
      surfaceId: "lunafreya",
      primaryAgentId: "lunafreya",
      executionProjectId: "alpha",
    });
    missionIds.push(mission.id);

    const target = resolveSessionRouteTarget("session-luna");

    expect(target).toMatchObject({
      endpointUrl: "http://127.0.0.1:4402",
      mode: "managed",
      ownerAgent: "lunafreya",
      managedSession: expect.objectContaining({
        missionId: "managed-luna",
        ownerAgent: "lunafreya",
      }),
    });
    expect(target.client).toEqual({
      options: {
        baseUrl: "http://127.0.0.1:4402",
        directory: root,
      },
    });
  });

  it("falls back to the default OpenCode client for unmanaged sessions", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const target = resolveSessionRouteTarget("session-unmanaged");

    expect(target).toMatchObject({
      endpointUrl: null,
      mode: "default",
      ownerAgent: null,
      managedSession: null,
    });
    expect(target.client).toEqual({
      options: {
        baseUrl: "http://127.0.0.1:4096",
        directory: root,
      },
    });
  });

  it("throws when a managed session owner has no tmux endpoint entry", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    writeEndpointManifest(root, [
      {
        agentId: "noctis",
        port: 4401,
        url: "http://127.0.0.1:4401",
      },
    ]);

    const mission = createMission("managed-luna", "session-luna", {
      title: "Lunafreya Mission",
      surfaceId: "lunafreya",
      primaryAgentId: "lunafreya",
      executionProjectId: "alpha",
    });
    missionIds.push(mission.id);

    expect(() => resolveSessionRouteTarget("session-luna")).toThrow(
      /session-luna.*lunafreya|lunafreya.*session-luna/,
    );
  });
});
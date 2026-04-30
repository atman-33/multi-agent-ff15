import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { APP_ROOT_EXECUTION_PROJECT_ID } from "@/lib/execution-context";
import { listOwnedSessionTmuxDispatchItems } from "@/lib/owned-session-transport.server";
import { readOwnedSession } from "@/lib/owned-session-registry.server";
import { readSessionExecutionContext } from "@/lib/session-execution-context.server";

const { ownerPromptAsyncMock, ownerSessionCreateMock, promptAsyncMock, sessionCreateMock } = vi.hoisted(() => ({
  ownerPromptAsyncMock: vi.fn(),
  ownerSessionCreateMock: vi.fn(),
  promptAsyncMock: vi.fn(),
  sessionCreateMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  createProjectOpencodeClient: () => ({
    session: {
      create: ownerSessionCreateMock,
      promptAsync: ownerPromptAsyncMock,
    },
  }),
  getOpencodeClient: () => ({
    session: {
      create: sessionCreateMock,
      promptAsync: promptAsyncMock,
    },
  }),
}));

import { action } from "./api.opencode.session.start";

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-opencode-session-start-"));
  tempRoots.push(root);

  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "projects", "alpha"), { recursive: true });
  mkdirSync(join(root, "projects", "beta"), { recursive: true });
  mkdirSync(join(root, "external-alpha"), { recursive: true });
  mkdirSync(join(root, "external-beta"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  writeFileSync(join(root, "AGENTS.md"), "# Root Agents\n", "utf-8");
  writeFileSync(join(root, "config", "settings.yaml"), "language: en\n", "utf-8");
  writeFileSync(
    join(root, "projects", "alpha", "project.yaml"),
    [
      'id: "alpha"',
      'name: "Alpha Project"',
      'root_path: "../../external-alpha"',
      'serena_project: "alpha"',
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(root, "projects", "beta", "project.yaml"),
    [
      'id: "beta"',
      'name: "Beta Project"',
      'root_path: "../../external-beta"',
      'serena_project: "beta"',
      "",
    ].join("\n"),
    "utf-8",
  );

  return root;
}

function writeHealthyTmuxTransportBootstrapArtifacts(root: string): void {
  mkdirSync(join(root, "runtime"), { recursive: true });
  writeFileSync(
    join(root, "runtime", "opencode-endpoints.json"),
    `${JSON.stringify(
      {
        version: 1,
        startedAt: "2026-04-30T00:00:00.000Z",
        agents: [
          {
            agentId: "iris",
            port: 4405,
            url: "http://127.0.0.1:4405",
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
  writeFileSync(
    join(root, "runtime", "tmux-transport-dispatcher.json"),
    `${JSON.stringify(
      {
        version: 1,
        owner: "standby",
        mode: "tmux-resident",
        pid: process.pid,
        startedAt: "2026-04-30T00:00:00.000Z",
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
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
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("api.opencode.session.start", () => {
  it("persists owned-session metadata for tmux-resident Iris session starts", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    writeFileSync(join(root, "config", "settings.yaml"), 'language: en\ntransport_mode: "tmux-resident"\n', "utf-8");
    writeHealthyTmuxTransportBootstrapArtifacts(root);
    ownerSessionCreateMock.mockResolvedValue({ data: { id: "session-iris-start" } });

    const response = await action({
      request: new Request("http://localhost/api/opencode/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "iris",
          ownedSessionSurface: "projects-iris",
          parts: [{ type: "text", text: "Manage the project registry." }],
        }),
      }),
    } as never);

    expect(response.status).toBe(201);
    expect(ownerSessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: root,
        title: "Manage the project registry.",
      }),
    );
    expect(sessionCreateMock).not.toHaveBeenCalled();
    expect(ownerPromptAsyncMock).not.toHaveBeenCalled();
    expect(promptAsyncMock).not.toHaveBeenCalled();
    expect(readOwnedSession("session-iris-start")).toMatchObject({
      ownerAgent: "iris",
      surface: "projects-iris",
      transportMode: "tmux-resident",
    });
    expect(listOwnedSessionTmuxDispatchItems("session-iris-start")).toMatchObject([
      {
        status: "pending",
        payload: {
          agent: "iris",
          sessionId: "session-iris-start",
          sessionTitle: "Manage the project registry.",
          parts: expect.arrayContaining([
            expect.objectContaining({
              type: "text",
              text: "Manage the project registry.",
            }),
          ]),
        },
      },
    ]);
  });

  it("defaults new sessions to the app root execution context", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    sessionCreateMock.mockResolvedValue({ data: { id: "session-root" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-root" } });

    const response = await action({
      request: new Request("http://localhost/api/opencode/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parts: [{ type: "text", text: "Inspect the repo" }],
        }),
      }),
    } as never);

    expect(response.status).toBe(201);
    expect(sessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: root,
      }),
    );
    expect(readSessionExecutionContext("session-root")).toEqual({
      contextProjectIds: [],
      executionProjectId: APP_ROOT_EXECUTION_PROJECT_ID,
      updatedAt: expect.any(String),
    });
  });

  it("uses the selected execution project root and persists context projects", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    sessionCreateMock.mockResolvedValue({ data: { id: "session-alpha" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-alpha" } });

    const response = await action({
      request: new Request("http://localhost/api/opencode/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parts: [{ type: "text", text: "Implement the alpha change" }],
          executionProjectId: "alpha",
          contextProjectIds: ["beta", "alpha", "beta"],
        }),
      }),
    } as never);

    expect(response.status).toBe(201);
    expect(sessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: join(root, "external-alpha"),
      }),
    );
    expect(readSessionExecutionContext("session-alpha")).toEqual({
      contextProjectIds: ["beta"],
      executionProjectId: "alpha",
      updatedAt: expect.any(String),
    });
  });
});
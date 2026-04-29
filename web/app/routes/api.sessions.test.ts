import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMission, deleteMission, setWorkerSession } from "@/lib/mission-store";
import { saveSessionExecutionContext } from "@/lib/session-execution-context.server";

const { sessionListMock } = vi.hoisted(() => ({
  sessionListMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  getOpencodeClient: () => ({
    session: {
      list: sessionListMock,
    },
  }),
}));

import { loader } from "./api.sessions";

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];
const missionIds: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-api-sessions-"));
  tempRoots.push(root);

  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "projects", "alpha"), { recursive: true });
  mkdirSync(join(root, "projects", "beta"), { recursive: true });
  mkdirSync(join(root, "external-alpha"), { recursive: true });
  mkdirSync(join(root, "external-beta"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  writeFileSync(join(root, "AGENTS.md"), "# Root Agents\n", "utf-8");
  writeFileSync(
    join(root, "projects", "alpha", "project.yaml"),
    ['id: "alpha"', 'name: "Alpha Project"', 'root_path: "../../external-alpha"', ""].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(root, "projects", "beta", "project.yaml"),
    ['id: "beta"', 'name: "Beta Project"', 'root_path: "../../external-beta"', ""].join("\n"),
    "utf-8",
  );

  return root;
}

afterEach(() => {
  sessionListMock.mockReset();

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
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("api.sessions", () => {
  it("returns managed session ownership and effective execution summaries", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const missionId = `mission-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", {
      title: "Managed Mission",
      executionProjectId: "alpha",
      contextProjectIds: ["beta"],
    });
    setWorkerSession(missionId, "ignis", "session-ignis");
    saveSessionExecutionContext("session-generic", {
      executionProjectId: "app_root",
      contextProjectIds: [],
    });

    sessionListMock.mockResolvedValue({
      data: [
        {
          id: "session-noctis",
          title: `mission:${missionId}:noctis`,
          directory: root,
          time: { created: 1, updated: 2 },
        },
        {
          id: "session-ignis",
          title: `mission:${missionId}:ignis`,
          directory: root,
          time: { created: 3, updated: 4 },
        },
        {
          id: "session-generic",
          title: "Generic Session",
          directory: "/tmp/generic",
          time: { created: 5, updated: 6 },
        },
      ],
    });

    const response = await loader({
      request: new Request("http://localhost/api/sessions?view=all"),
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sessions: [
        expect.objectContaining({
          id: "session-noctis",
          executionSummary: "Alpha Project + Beta Project",
          managedSession: {
            missionId,
            missionTitle: "Managed Mission",
            ownerAgent: "noctis",
            ownerLabel: "Noctis",
          },
        }),
        expect.objectContaining({
          id: "session-ignis",
          executionSummary: "Alpha Project + Beta Project",
          managedSession: {
            missionId,
            missionTitle: "Managed Mission",
            ownerAgent: "ignis",
            ownerLabel: "Ignis",
          },
        }),
        expect.objectContaining({
          id: "session-generic",
          executionSummary: "App Root (multi-agent-ff15)",
          managedSession: null,
        }),
      ],
    });
  });
});
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { sessionMessagesMock, sessionStatusMock } = vi.hoisted(() => ({
  sessionMessagesMock: vi.fn(),
  sessionStatusMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  getOpencodeClient: () => ({
    session: {
      messages: sessionMessagesMock,
      status: sessionStatusMock,
    },
  }),
}));

import { createMission, deleteMission, setWorkerSession } from "@/lib/mission-store";
import { loader } from "./api.noctis.missions";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-noctis-missions-route-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

afterEach(() => {
  sessionMessagesMock.mockReset();
  sessionStatusMock.mockReset();

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

describe("api.noctis.missions", () => {
  it("returns stored primary-session freshness without calling session APIs", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const missionId = `mission-summary-${crypto.randomUUID()}`;
    missionIds.push(missionId);

    const mission = createMission(missionId, "session-primary", {
      title: "Summary Mission",
      objective: "Verify summary payload",
    });
    setWorkerSession(missionId, "ignis", "session-ignis");
    mission.latestPrimaryMessageCreatedAt = "2026-04-29T00:00:00.000Z";
    mission.latestPrimaryMessageId = "message-1";

    const response = await loader({
      request: new Request("http://localhost/api/noctis/missions?view=all"),
    } as never);

    expect(response.status).toBe(200);
    const data = await readJson<{
      counts: { active: number; archived: number };
      missions: Array<{
        missionId: string;
        primarySessionId?: string | null;
        latestPrimaryMessageId?: string | null;
        latestPrimaryMessageCreatedAt?: string | null;
        messages?: unknown;
      }>;
    }>(response);

    expect(data.counts).toEqual({ active: 1, archived: 0 });
    expect(data.missions).toEqual([
      expect.objectContaining({
        missionId,
        primarySessionId: "session-primary",
        latestPrimaryMessageId: "message-1",
        latestPrimaryMessageCreatedAt: "2026-04-29T00:00:00.000Z",
      }),
    ]);
    expect(data.missions[0]).not.toHaveProperty("messages");
    expect(sessionStatusMock).not.toHaveBeenCalled();
    expect(sessionMessagesMock).not.toHaveBeenCalled();
  });
});
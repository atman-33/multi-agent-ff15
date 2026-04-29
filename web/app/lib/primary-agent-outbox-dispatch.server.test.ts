import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { listPrimaryAgentOutboxItems } from "./mission-primary-agent-outbox.server";
import { createMission, deleteMission, getMission } from "./mission-store";
import { queueTmuxAgentDispatch } from "./primary-agent-outbox-dispatch.server";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-tmux-dispatch-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

afterEach(() => {
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

describe("primary-agent-outbox-dispatch.server", () => {
  it("queues worker-targeted tmux deliveries with caller-defined activity text", () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const mission = createMission("mission-worker-queue", "session-noctis", {
      title: "Worker queue mission",
      objective: "Queue delegated worker deliveries through tmux transport",
      executionProjectId: "alpha",
    });
    missionIds.push(mission.id);

    const item = queueTmuxAgentDispatch({
      missionId: mission.id,
      agent: "ignis",
      sessionId: "session-ignis",
      sessionTitle: `mission:${mission.id}:ignis`,
      parts: [{ type: "text", text: "Delegated worker task payload" }],
      activityBody: "Queued tmux worker delivery.",
    });

    expect(item).toMatchObject({
      status: "pending",
      payload: {
        agent: "ignis",
        sessionId: "session-ignis",
        sessionTitle: `mission:${mission.id}:ignis`,
      },
    });
    expect(listPrimaryAgentOutboxItems(mission.id)).toEqual([item]);
    expect(getMission(mission.id)?.activityLog).toContainEqual(
      expect.objectContaining({
        kind: "system_event",
        body: "Queued tmux worker delivery.",
      }),
    );
    expect(getMission(mission.id)?.activityLog.map((entry) => entry.body).join("\n") ?? "").not.toContain(
      "Delegated worker task payload",
    );
  });
});
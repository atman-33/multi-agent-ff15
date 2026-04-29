import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMission, deleteMission, getMissionDir } from "./mission-store";
import {
  enqueuePrimaryAgentOutboxItem,
  enqueueTmuxDispatchItem,
  leasePrimaryAgentOutboxItem,
  leaseTmuxDispatchItem,
  listPrimaryAgentOutboxItems,
  listTmuxDispatchItems,
  markPrimaryAgentOutboxItemSubmitted,
  markTmuxDispatchItemSubmitted,
  updateTmuxDispatchItemRecordLinks,
} from "./mission-primary-agent-outbox.server";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-outbox-"));
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

describe("mission primary-agent outbox", () => {
  it("enqueues a pending outbox item under the mission transport directory", () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const mission = createMission("mission-outbox-pending", "session-primary-1", {
      title: "Pending Outbox Mission",
      objective: "Verify pending artifact persistence",
    });
    missionIds.push(mission.id);

    const item = enqueuePrimaryAgentOutboxItem({
      missionId: mission.id,
      itemId: "item-pending-1",
      createdAt: "2026-04-28T00:00:00.000Z",
      payload: {
        agent: "noctis",
        sessionId: "session-primary-1",
        parts: [{ type: "text", text: "queued prompt" }],
        system: "{\"missionId\":\"mission-outbox-pending\"}",
        model: {
          providerID: "openai",
          modelID: "gpt-5.4",
        },
        variant: "fast",
      },
    });

    expect(item.status).toBe("pending");
    expect(item.payload.parts).toEqual([{ type: "text", text: "queued prompt" }]);

    const pendingPath = join(
      getMissionDir(mission.id),
      "transport",
      "primary-agent-outbox",
      "pending",
      "item-pending-1.json",
    );
    expect(existsSync(pendingPath)).toBe(true);

    const persisted = JSON.parse(readFileSync(pendingPath, "utf-8")) as { status: string };
    expect(persisted.status).toBe("pending");
    expect(listPrimaryAgentOutboxItems(mission.id)).toEqual([item]);
  });

  it("retains submitted artifacts after a leased item is submitted", () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const mission = createMission("mission-outbox-submitted", "session-primary-2", {
      title: "Submitted Outbox Mission",
      objective: "Verify submitted artifact retention",
    });
    missionIds.push(mission.id);

    enqueuePrimaryAgentOutboxItem({
      missionId: mission.id,
      itemId: "item-submitted-1",
      createdAt: "2026-04-28T00:01:00.000Z",
      payload: {
        agent: "noctis",
        sessionId: "session-primary-2",
        parts: [{ type: "text", text: "submitted prompt" }],
      },
    });

    const leased = leasePrimaryAgentOutboxItem({
      missionId: mission.id,
      leaseOwner: "dispatcher-a",
      leasedAt: "2026-04-28T00:02:00.000Z",
      staleAfterMs: 30_000,
    });

    expect(leased?.status).toBe("leased");

    const submitted = markPrimaryAgentOutboxItemSubmitted({
      missionId: mission.id,
      itemId: "item-submitted-1",
      submittedAt: "2026-04-28T00:03:00.000Z",
      submittedBy: "dispatcher-a",
      dispatcherPid: 4242,
    });

    expect(submitted.status).toBe("submitted");
    expect(submitted.submission).toEqual({
      dispatcherPid: 4242,
      submittedAt: "2026-04-28T00:03:00.000Z",
      submittedBy: "dispatcher-a",
    });

    const submittedPath = join(
      getMissionDir(mission.id),
      "transport",
      "primary-agent-outbox",
      "submitted",
      "item-submitted-1.json",
    );
    expect(existsSync(submittedPath)).toBe(true);
    expect(listPrimaryAgentOutboxItems(mission.id)).toEqual([submitted]);
  });

  it("reclaims stale leased items with recovery metadata", () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const mission = createMission("mission-outbox-stale-lease", "session-primary-3", {
      title: "Stale Lease Mission",
      objective: "Verify stale lease recovery",
    });
    missionIds.push(mission.id);

    enqueuePrimaryAgentOutboxItem({
      missionId: mission.id,
      itemId: "item-stale-1",
      createdAt: "2026-04-28T00:10:00.000Z",
      payload: {
        agent: "noctis",
        sessionId: "session-primary-3",
        parts: [{ type: "text", text: "recover me" }],
      },
    });

    const initialLease = leasePrimaryAgentOutboxItem({
      missionId: mission.id,
      leaseOwner: "dispatcher-a",
      leasedAt: "2026-04-28T00:10:05.000Z",
      staleAfterMs: 1_000,
    });

    expect(initialLease?.lease).toEqual({
      attempt: 1,
      leasedAt: "2026-04-28T00:10:05.000Z",
      owner: "dispatcher-a",
      staleAfterMs: 1_000,
    });

    const reclaimedLease = leasePrimaryAgentOutboxItem({
      missionId: mission.id,
      leaseOwner: "dispatcher-b",
      leasedAt: "2026-04-28T00:10:07.500Z",
      staleAfterMs: 1_000,
    });

    expect(reclaimedLease?.lease).toEqual({
      attempt: 2,
      leasedAt: "2026-04-28T00:10:07.500Z",
      owner: "dispatcher-b",
      recoveredFrom: {
        attempt: 1,
        leasedAt: "2026-04-28T00:10:05.000Z",
        owner: "dispatcher-a",
        staleAfterMs: 1_000,
      },
      staleAfterMs: 1_000,
    });
  });

  it("provides generic tmux dispatch lifecycle helpers for worker-targeted items", () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const mission = createMission("mission-outbox-generic", "session-primary-generic", {
      title: "Generic Dispatch Mission",
      objective: "Verify generic dispatch lifecycle helpers",
    });
    missionIds.push(mission.id);

    const item = enqueueTmuxDispatchItem({
      missionId: mission.id,
      itemId: "item-generic-1",
      createdAt: "2026-04-28T00:20:00.000Z",
      payload: {
        agent: "ignis",
        sessionId: "session-ignis-1",
        sessionTitle: `mission:${mission.id}:ignis`,
        parts: [{ type: "text", text: "generic queued prompt" }],
      },
    });

    expect(listTmuxDispatchItems(mission.id)).toEqual([item]);

    const leased = leaseTmuxDispatchItem({
      missionId: mission.id,
      leaseOwner: "dispatcher-generic",
      leasedAt: "2026-04-28T00:21:00.000Z",
      staleAfterMs: 30_000,
    });

    expect(leased?.status).toBe("leased");

    const submitted = markTmuxDispatchItemSubmitted({
      missionId: mission.id,
      itemId: "item-generic-1",
      submittedAt: "2026-04-28T00:22:00.000Z",
      submittedBy: "dispatcher-generic",
      dispatcherPid: 7171,
    });

    expect(submitted.status).toBe("submitted");
    expect(listTmuxDispatchItems(mission.id)).toEqual([submitted]);
  });

  it("stores record links on queued tmux dispatch items", () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const mission = createMission("mission-outbox-record-links", "session-primary-links", {
      title: "Record Link Mission",
      objective: "Verify tmux dispatch record-link persistence",
    });
    missionIds.push(mission.id);

    enqueueTmuxDispatchItem({
      missionId: mission.id,
      itemId: "item-links-1",
      createdAt: "2026-04-28T00:30:00.000Z",
      payload: {
        agent: "ignis",
        sessionId: "session-ignis-links",
        parts: [{ type: "text", text: "linked prompt" }],
      },
    });

    const updated = updateTmuxDispatchItemRecordLinks({
      missionId: mission.id,
      itemId: "item-links-1",
      recordLinks: {
        activityEntryId: "activity_msg_links",
        conversationEntryIds: ["banter-a", "banter-b"],
        messageLogEntryId: "msg_links",
      },
    });

    expect(updated.payload.recordLinks).toEqual({
      activityEntryId: "activity_msg_links",
      conversationEntryIds: ["banter-a", "banter-b"],
      messageLogEntryId: "msg_links",
    });
    expect(listTmuxDispatchItems(mission.id)).toEqual([updated]);
  });
});
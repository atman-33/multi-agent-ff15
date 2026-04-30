import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-owned-session-transport-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

afterEach(() => {
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

describe("owned-session-transport.server", () => {
  it("queues durable tmux dispatch records for Iris-owned sessions", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const module = await import("./owned-session-transport.server");
    const item = module.queueOwnedSessionTmuxDispatch({
      ownerAgent: "iris",
      sessionId: "session-iris",
      sessionTitle: "iris:projects",
      parts: [{ type: "text", text: "Refresh the project registry." }],
      model: {
        providerID: "openai",
        modelID: "gpt-4.1",
      },
      variant: "high",
    });

    expect(item).toMatchObject({
      missionId: module.getOwnedSessionTransportMissionId("session-iris"),
      status: "pending",
      payload: {
        agent: "iris",
        sessionId: "session-iris",
        sessionTitle: "iris:projects",
        model: {
          providerID: "openai",
          modelID: "gpt-4.1",
        },
        variant: "high",
      },
    });
    expect(module.listOwnedSessionTmuxDispatchItems("session-iris")).toEqual([item]);
  });
});
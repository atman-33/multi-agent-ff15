import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMission, deleteMission, getMissionOutputFilePath } from "@/lib/mission-store";
import { loader } from "./api.reports";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-api-reports-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "docs", "reports", "archive"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

function seedMission(missionId: string): void {
  createMission(missionId, `session-${missionId}`, {
    title: missionId,
    objective: "Report separation test",
    allowedWorkers: ["ignis", "gladiolus", "prompto"],
  });
  missionIds.push(missionId);
}

function writeMissionOutput(input: {
  missionId: string;
  step: string;
  taskId: string;
  filename: string;
  content: string;
}) {
  const filePath = getMissionOutputFilePath(
    input.missionId,
    input.step,
    input.taskId,
    input.filename,
  );
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, input.content, "utf-8");
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

describe("api.reports", () => {
  it("does not mix mission runtime outputs into the reports library", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const missionId = `mission-reports-separation-${crypto.randomUUID()}`;
    seedMission(missionId);
    writeMissionOutput({
      missionId,
      step: "review",
      taskId: "task-review-1",
      filename: "code-review.md",
      content: "# Runtime output\n",
    });

    const response = await loader({ request: new Request("http://localhost/api/reports") } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ reports: [] });
  });
});
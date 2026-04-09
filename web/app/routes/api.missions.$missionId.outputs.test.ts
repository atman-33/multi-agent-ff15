import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMission, deleteMission, getMissionOutputFilePath } from "@/lib/mission-store";
import { loader as outputLoader } from "./api.missions.$missionId.output";
import { loader as outputsLoader } from "./api.missions.$missionId.outputs";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-mission-output-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

function seedMission(missionId: string): void {
  createMission(missionId, `session-${missionId}`, {
    title: missionId,
    objective: "Test mission",
    allowedWorkers: ["ignis", "gladiolus", "prompto"],
  });
  missionIds.push(missionId);
}

function writeOutput(input: {
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
  return filePath;
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
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

describe("api.missions.$missionId.outputs", () => {
  it("lists mission-scoped outputs with absolute paths", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const missionId = `mission-outputs-${crypto.randomUUID()}`;
    seedMission(missionId);
    const filePath = writeOutput({
      missionId,
      step: "review",
      taskId: "task-review-1",
      filename: "code-review.md",
      content: [
        "---",
        "title: Code review",
        "author: Ignis",
        "date: 2026-04-05T00:00:00.000Z",
        "---",
        "",
        "Approved.",
      ].join("\n"),
    });

    const response = await outputsLoader({ params: { missionId } } as never);

    expect(response.status).toBe(200);
    const data = await readJson(response);
    expect(data.outputs).toEqual([
      expect.objectContaining({
        step: "review",
        taskId: "task-review-1",
        filename: "code-review.md",
        title: "Code review",
        author: "Ignis",
        filePath,
      }),
    ]);
    expect(isAbsolute((data.outputs as Array<{ filePath: string }>)[0].filePath)).toBe(true);
  });

  it("returns not found when the mission does not exist", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const response = await outputsLoader({ params: { missionId: "missing-mission" } } as never);

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toMatchObject({ error: "Mission not found" });
  });
});

describe("api.missions.$missionId.output", () => {
  it("reads a selected mission output document", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const missionId = `mission-output-${crypto.randomUUID()}`;
    seedMission(missionId);
    const filePath = writeOutput({
      missionId,
      step: "spec-planning",
      taskId: "step_spec-planning_1",
      filename: "spec-plan.md",
      content: [
        "---",
        "title: Spec plan",
        "date: 2026-04-05T00:00:00.000Z",
        "---",
        "",
        "# Plan",
        "",
        "Details.",
      ].join("\n"),
    });

    const response = await outputLoader({
      request: new Request(
        `http://localhost/api/missions/${missionId}/output?step=spec-planning&taskId=step_spec-planning_1&file=spec-plan.md`,
      ),
      params: { missionId },
    } as never);

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      step: "spec-planning",
      taskId: "step_spec-planning_1",
      filename: "spec-plan.md",
      title: "Spec plan",
      displayMode: "markdown",
      filePath,
      content: expect.stringContaining("# Plan"),
      frontmatter: {
        title: "Spec plan",
        date: "2026-04-05T00:00:00.000Z",
      },
    });
  });

  it("returns metadata-only state for frontmatter-only mission outputs", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const missionId = `mission-output-frontmatter-only-${crypto.randomUUID()}`;
    seedMission(missionId);
    writeOutput({
      missionId,
      step: "prepare-run",
      taskId: "step_prepare-run_1",
      filename: "news-run-plan.md",
      content: [
        "---",
        "title: News run plan",
        "author: Noctis",
        "change_name: shared-frontmatter-document-preview",
        "---",
        "",
      ].join("\n"),
    });

    const response = await outputLoader({
      request: new Request(
        `http://localhost/api/missions/${missionId}/output?step=prepare-run&taskId=step_prepare-run_1&file=news-run-plan.md`,
      ),
      params: { missionId },
    } as never);

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      step: "prepare-run",
      taskId: "step_prepare-run_1",
      filename: "news-run-plan.md",
      title: "News run plan",
      author: "Noctis",
      displayMode: "metadata-only",
      content: "",
      frontmatter: {
        title: "News run plan",
        author: "Noctis",
        change_name: "shared-frontmatter-document-preview",
      },
    });
  });

  it("returns bad request when a required selector is missing", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const missionId = `mission-output-missing-selector-${crypto.randomUUID()}`;
    seedMission(missionId);

    const response = await outputLoader({
      request: new Request(`http://localhost/api/missions/${missionId}/output?step=review&file=code-review.md`),
      params: { missionId },
    } as never);

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toMatchObject({ error: "Missing taskId" });
  });
});
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loader } from "./api.report";

const tempRoots: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-api-report-"));
  tempRoots.push(root);

  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n");
  mkdirSync(join(root, "docs", "reports", "archive"), { recursive: true });

  return root;
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
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

describe("api.report", () => {
  it.each([false, true])("returns an absolute filePath for archived=%s", async (archived) => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const root = process.env.MULTI_AGENT_FF15_ROOT;
    if (!root) {
      throw new Error("Missing test root");
    }

    const filename = "workflow-step-completion-contract-simplification-20260401-20260401.md";
    const directory = archived ? join(root, "docs", "reports", "archive") : join(root, "docs", "reports");
    mkdirSync(directory, { recursive: true });

    const filePath = join(directory, filename);
    writeFileSync(
      filePath,
      [
        "---",
        "title: Absolute path report",
        "author: Noctis",
        "date: 2026-04-01T00:00:00.000Z",
        "---",
        "",
        "Report body.",
      ].join("\n"),
    );

    const response = await loader({
      request: new Request(
        `http://localhost/api/report?file=${encodeURIComponent(filename)}${archived ? "&archived=true" : ""}`,
      ),
    } as never);

    expect(response.status).toBe(200);

    const data = await readJson(response);
    expect(data).toMatchObject({
      archived,
      filePath,
      filename,
      title: "Absolute path report",
    });
    expect(typeof data.filePath).toBe("string");
    expect(isAbsolute(data.filePath as string)).toBe(true);
  });
});

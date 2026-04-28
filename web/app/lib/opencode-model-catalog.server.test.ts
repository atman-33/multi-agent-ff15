import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-model-catalog-"));
  tempRoots.push(root);
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

function verboseOutput(): string {
  return [
    "github-copilot/gpt-5.4",
    "{",
    '  "id": "gpt-5.4",',
    '  "name": "GPT-5.4",',
    '  "variants": {',
    '    "medium": {},',
    '    "high": {}',
    "  }",
    "}",
    "github-copilot/claude-haiku-4.5",
    "{",
    '  "id": "claude-haiku-4.5",',
    '  "name": "Claude Haiku 4.5"',
    "}",
    "",
  ].join("\n");
}

function installExecSuccess(output = verboseOutput()): void {
  execFileMock.mockImplementation((
    file: string,
    args: string[],
    options: unknown,
    callback?: (error: Error | null, stdout: string, stderr: string) => void
  ) => {
    const done = typeof options === "function" ? options : callback;
    if (!done) {
      throw new Error("Missing callback");
    }

    if (file !== "opencode") {
      done(new Error(`Unexpected file: ${file}`), "", "");
      return;
    }

    if (args[0] === "models" && args[1] === "--verbose") {
      done(null, output, "");
      return;
    }

    if (args[0] === "--version") {
      done(null, "1.2.3\n", "");
      return;
    }

    done(new Error(`Unexpected args: ${args.join(" ")}`), "", "");
  });
}

async function loadModule() {
  vi.resetModules();
  return import("./opencode-model-catalog.server");
}

afterEach(() => {
  execFileMock.mockReset();

  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("opencode-model-catalog.server", () => {
  it("parses verbose output into models and variants", async () => {
    const { parseOpencodeModelsVerboseOutput } = await loadModule();

    expect(parseOpencodeModelsVerboseOutput(verboseOutput())).toEqual({
      models: ["github-copilot/gpt-5.4", "github-copilot/claude-haiku-4.5"],
      namesByModel: {
        "github-copilot/claude-haiku-4.5": "Claude Haiku 4.5",
        "github-copilot/gpt-5.4": "GPT-5.4",
      },
      variantsByModel: {
        "github-copilot/claude-haiku-4.5": [],
        "github-copilot/gpt-5.4": ["medium", "high"],
      },
    });
  });

  it("writes the latest catalog snapshot to runtime", async () => {
    installExecSuccess();
    const root = createTempRoot();
    const module = await loadModule();

    const snapshot = await module.refreshOpencodeModelCatalog(root);
    const filePath = module.getOpencodeModelCatalogPath(root);

    expect(snapshot).not.toBeNull();
    expect(existsSync(filePath)).toBe(true);
    expect(JSON.parse(readFileSync(filePath, "utf-8"))).toMatchObject({
      models: ["github-copilot/gpt-5.4", "github-copilot/claude-haiku-4.5"],
      namesByModel: {
        "github-copilot/claude-haiku-4.5": "Claude Haiku 4.5",
        "github-copilot/gpt-5.4": "GPT-5.4",
      },
      opencodeVersion: "1.2.3",
      sourceCommand: "opencode models --verbose",
      variantsByModel: {
        "github-copilot/claude-haiku-4.5": [],
        "github-copilot/gpt-5.4": ["medium", "high"],
      },
    });
  });

  it("reuses the same in-flight refresh promise", async () => {
    const root = createTempRoot();
    let release: (() => void) | null = null;
    let modelCalls = 0;

    execFileMock.mockImplementation((
      file: string,
      args: string[],
      options: unknown,
      callback?: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      const done = typeof options === "function" ? options : callback;
      if (!done) {
        throw new Error("Missing callback");
      }

      if (file !== "opencode") {
        done(new Error(`Unexpected file: ${file}`), "", "");
        return;
      }

      if (args[0] === "--version") {
        done(null, "1.2.3\n", "");
        return;
      }

      if (args[0] === "models" && args[1] === "--verbose") {
        modelCalls += 1;
        release = () => done(null, verboseOutput(), "");
        return;
      }

      done(new Error(`Unexpected args: ${args.join(" ")}`), "", "");
    });

    const module = await loadModule();
    const first = module.refreshOpencodeModelCatalog(root);
    const second = module.refreshOpencodeModelCatalog(root);

    expect(first).toBe(second);
    expect(modelCalls).toBe(1);

    const completeRefresh =
      release ??
      (() => {
        throw new Error("Missing refresh completion callback");
      });
    completeRefresh();
    await expect(first).resolves.not.toBeNull();
  });

  it("keeps the last successful snapshot when refresh fails", async () => {
    const root = createTempRoot();
    installExecSuccess();
    const module = await loadModule();

    await module.refreshOpencodeModelCatalog(root);

    execFileMock.mockImplementation((
      _file: string,
      args: string[],
      options: unknown,
      callback?: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      const done = typeof options === "function" ? options : callback;
      if (!done) {
        throw new Error("Missing callback");
      }

      if (args[0] === "--version") {
        done(null, "1.2.3\n", "");
        return;
      }

      done(new Error("refresh failed"), "", "");
    });

    await expect(module.refreshOpencodeModelCatalog(root)).rejects.toThrow("refresh failed");

    const result = await module.readOpencodeModelCatalog({ root, waitForLatest: false });

    expect(result.snapshot).not.toBeNull();
    expect(result.refreshState).toBe("error");
    expect(result.stale).toBe(true);
    expect(result.lastError).toBe("refresh failed");
  });
});
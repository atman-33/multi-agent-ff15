import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: (command: string, args?: string[]) => {
    if (command === "oh-my-opencode" && args?.[0] === "--version") {
      return "1.2.3\n";
    }

    if (command === "opencode" && args?.[0] === "models") {
      return "";
    }

    throw new Error(`Unexpected command: ${command}`);
  },
}));

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");

  return {
    ...actual,
    homedir: () => process.env.HOME ?? actual.homedir(),
  };
});

const tempHomes: string[] = [];
const originalHome = process.env.HOME;

function createTempHome(): string {
  const home = mkdtempSync(join(tmpdir(), "multi-agent-ff15-oh-my-opencode-"));
  tempHomes.push(home);
  return home;
}

function createConfigPath(home: string, fileName: string): string {
  const configDir = join(home, ".config", "opencode");
  mkdirSync(configDir, { recursive: true });
  return join(configDir, fileName);
}

async function loadModule() {
  vi.resetModules();
  return import("./oh-my-opencode-config.server");
}

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }

  while (tempHomes.length > 0) {
    const home = tempHomes.pop();
    if (home) {
      rmSync(home, { force: true, recursive: true });
    }
  }
});

describe("oh-my-opencode-config.server", () => {
  it("prefers the renamed config file when both config files exist", async () => {
    const home = createTempHome();
    const primaryPath = createConfigPath(home, "oh-my-openagent.json");
    const legacyPath = createConfigPath(home, "oh-my-opencode.json");

    process.env.HOME = home;

    writeFileSync(primaryPath, JSON.stringify({ categories: { alpha: { model: "new/model" } } }), "utf-8");
    writeFileSync(legacyPath, JSON.stringify({ categories: { alpha: { model: "legacy/model" } } }), "utf-8");

    const { readOhMyOpenCodeData } = await loadModule();
    const result = readOhMyOpenCodeData();

    expect(result.config).toEqual({ categories: { alpha: { model: "new/model" } } });
    expect(result.error).toBeUndefined();
  });

  it("falls back to the legacy config file when the renamed file is missing", async () => {
    const home = createTempHome();
    const legacyPath = createConfigPath(home, "oh-my-opencode.json");

    process.env.HOME = home;

    writeFileSync(legacyPath, JSON.stringify({ agents: { beta: { model: "legacy/model" } } }), "utf-8");

    const { readOhMyOpenCodeData } = await loadModule();
    const result = readOhMyOpenCodeData();

    expect(result.config).toEqual({ agents: { beta: { model: "legacy/model" } } });
    expect(result.error).toBeUndefined();
  });

  it("writes new configs to oh-my-openagent.json by default", async () => {
    const home = createTempHome();
    const primaryPath = createConfigPath(home, "oh-my-openagent.json");

    process.env.HOME = home;

    const { writeOhMyOpenCodeConfig } = await loadModule();

    writeOhMyOpenCodeConfig({ categories: { gamma: { model: "new/model" } } });

    expect(existsSync(primaryPath)).toBe(true);
    expect(JSON.parse(readFileSync(primaryPath, "utf-8"))).toEqual({
      categories: { gamma: { model: "new/model" } },
    });
  });

  it("writes back to the legacy config file when it is the active file", async () => {
    const home = createTempHome();
    const legacyPath = createConfigPath(home, "oh-my-opencode.json");
    const primaryPath = createConfigPath(home, "oh-my-openagent.json");

    process.env.HOME = home;

    writeFileSync(legacyPath, JSON.stringify({ categories: { alpha: { model: "legacy/model" } } }), "utf-8");

    const { writeOhMyOpenCodeConfig } = await loadModule();

    writeOhMyOpenCodeConfig({ categories: { delta: { model: "updated/model" } } });

    expect(JSON.parse(readFileSync(legacyPath, "utf-8"))).toEqual({
      categories: { delta: { model: "updated/model" } },
    });
    expect(existsSync(primaryPath)).toBe(false);
  });
});
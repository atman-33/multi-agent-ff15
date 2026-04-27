import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./app_config_control.mts", import.meta.url));
const tempRoots = [];

function createTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-app-config-control-"));
  tempRoots.push(root);
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(
    join(root, "config", "settings.yaml"),
    [
      'language: "en"',
      'transport_mode: "app-owned"',
      'execution_workspace_root: "../custom-workspaces"',
      'shared_skills_root: "../shared-skills"',
      'theme: "desert"',
      "",
    ].join("\n"),
    "utf-8",
  );

  return root;
}

function runAppConfigControl(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", scriptPath, ...args], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

test.afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("updates transport mode while preserving unrelated settings", async () => {
  const root = createTempRoot();

  const result = await runAppConfigControl(["set-transport", "tmux-resident", "--root", root], {
    cwd: root,
  });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    config: {
      executionWorkspaceRoot: "../custom-workspaces",
      language: "en",
      sharedSkillsRoot: "../shared-skills",
      transportMode: "tmux-resident",
    },
    settingsPath: join(root, "config", "settings.yaml"),
    success: true,
  });

  const settings = readFileSync(join(root, "config", "settings.yaml"), "utf-8");
  assert.match(settings, /transport_mode: ?"?tmux-resident"?/);
  assert.match(settings, /theme: "desert"/);
});

test("rejects unsupported transport modes", async () => {
  const root = createTempRoot();

  const result = await runAppConfigControl(["set-transport", "invalid-mode", "--root", root], {
    cwd: root,
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Expected transport mode: app-owned or tmux-resident/);
});

test("treats a missing transport_mode setting as app-owned during updates", async () => {
  const root = createTempRoot();
  writeFileSync(
    join(root, "config", "settings.yaml"),
    [
      'language: "ja"',
      'shared_skills_root: "skills"',
      'theme: "desert"',
      "",
    ].join("\n"),
    "utf-8",
  );

  const result = await runAppConfigControl(["set-transport", "tmux-resident", "--root", root], {
    cwd: root,
  });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    config: {
      language: "ja",
      sharedSkillsRoot: "skills",
      transportMode: "tmux-resident",
    },
    settingsPath: join(root, "config", "settings.yaml"),
    success: true,
  });

  const settings = readFileSync(join(root, "config", "settings.yaml"), "utf-8");
  assert.match(settings, /transport_mode: ?"?tmux-resident"?/);
  assert.match(settings, /theme: "desert"/);
});
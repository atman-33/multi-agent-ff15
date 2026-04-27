import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const tempRoots = [];

function createTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-standby-transport-"));
  tempRoots.push(root);

  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "web", "app", "lib"), { recursive: true });

  cpSync(join(repoRoot, "standby.sh"), join(root, "standby.sh"));
  cpSync(join(repoRoot, "scripts", "app_config_control.mts"), join(root, "scripts", "app_config_control.mts"));
  cpSync(join(repoRoot, "web", "app", "lib", "app-config.server.ts"), join(root, "web", "app", "lib", "app-config.server.ts"));
  cpSync(join(repoRoot, "web", "app", "lib", "required-config.server.ts"), join(root, "web", "app", "lib", "required-config.server.ts"));
  symlinkSync(join(repoRoot, "web", "node_modules"), join(root, "web", "node_modules"), "dir");

  writeFileSync(
    join(root, "config", "settings.yaml"),
    [
      'language: "en"',
      'transport_mode: "app-owned"',
      'shared_skills_root: "skills"',
      'theme: "desert"',
      "",
    ].join("\n"),
    "utf-8",
  );

  return root;
}

function runStandby(root, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["./standby.sh", ...args], {
      cwd: root,
      env: { ...process.env },
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

test("updates transport mode through standby.sh without starting services", async () => {
  const root = createTempRoot();

  const result = await runStandby(root, ["--set-transport", "tmux-resident"]);

  assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /Transport mode updated: tmux-resident/);

  const settings = readFileSync(join(root, "config", "settings.yaml"), "utf-8");
  assert.match(settings, /transport_mode: "tmux-resident"/);
  assert.match(settings, /theme: "desert"/);
});
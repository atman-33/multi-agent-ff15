import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./tmux_transport_runtime.mts", import.meta.url));
const tempRoots = [];

function createTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-tmux-runtime-"));
  tempRoots.push(root);
  mkdirSync(join(root, "runtime"), { recursive: true });
  mkdirSync(join(root, "bin"), { recursive: true });
  return root;
}

function writeExecutable(path, content) {
  writeFileSync(path, content, { encoding: "utf-8", mode: 0o755 });
}

function installFakeTmux(root) {
  const tmuxPath = join(root, "bin", "tmux");
  writeExecutable(
    tmuxPath,
    `#!/usr/bin/env bash
set -euo pipefail
ROOT="\${TMUX_STUB_ROOT:?}"
LOG="\${ROOT}/tmux.log"
SESSION_FILE="\${ROOT}/tmux-session"
printf '%s\n' "\$*" >> "\$LOG"

case "\${1:-}" in
  has-session)
    if [ -f "\$SESSION_FILE" ]; then
      exit 0
    fi
    exit 1
    ;;
  new-session)
    : > "\$SESSION_FILE"
    exit 0
    ;;
  kill-session)
    rm -f "\$SESSION_FILE"
    exit 0
    ;;
  split-window|select-layout|select-pane|set-option|send-keys|rename-window)
    exit 0
    ;;
esac

exit 0
`,
  );
}

function runRuntimeControl(root, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", scriptPath, ...args], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${join(root, "bin")}:${process.env.PATH}`,
        TMUX_STUB_ROOT: root,
      },
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

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test.afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("starts a tmux agent roster, endpoint manifest, and dispatcher daemon", async () => {
  const root = createTempRoot();
  installFakeTmux(root);

  const startResult = await runRuntimeControl(root, ["start", "--root", root]);
  assert.equal(startResult.code, 0, startResult.stderr);

  const manifestPath = join(root, "runtime", "opencode-endpoints.json");
  const dispatcherStatePath = join(root, "runtime", "tmux-transport-dispatcher.json");
  assert.equal(existsSync(manifestPath), true);
  assert.equal(existsSync(dispatcherStatePath), true);

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  assert.equal(manifest.version, 1);
  assert.equal(Array.isArray(manifest.agents), true);
  assert.equal(manifest.agents.length, 6);

  const dispatcherState = JSON.parse(readFileSync(dispatcherStatePath, "utf-8"));
  assert.equal(dispatcherState.version, 1);
  assert.equal(dispatcherState.mode, "tmux-resident");
  assert.equal(dispatcherState.owner, "standby");
  assert.equal(typeof dispatcherState.pid, "number");
  assert.equal(isProcessAlive(dispatcherState.pid), true);

  const tmuxLog = readFileSync(join(root, "tmux.log"), "utf-8");
  assert.match(tmuxLog, /new-session/);
  assert.equal((tmuxLog.match(/send-keys -t/g) ?? []).length >= 6, true);
  assert.equal((tmuxLog.match(/opencode --agent/g) ?? []).length, 6);

  const stopResult = await runRuntimeControl(root, ["stop", "--root", root]);
  assert.equal(stopResult.code, 0, stopResult.stderr);
});
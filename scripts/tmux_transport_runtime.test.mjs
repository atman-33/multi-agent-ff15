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
  const sleepPath = join(root, "bin", "sleep");
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
  writeExecutable(
    sleepPath,
    `#!/usr/bin/env bash
set -euo pipefail
ROOT="\${TMUX_STUB_ROOT:?}"
LOG="\${ROOT}/tmux.log"
printf '%s\n' "sleep \$*" >> "\$LOG"
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

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return predicate();
}

function seedPrimaryAgentOutbox(root, missionId, options = {}) {
  const pendingDir = join(
    root,
    "runtime",
    "noctis-missions",
    missionId,
    "transport",
    "primary-agent-outbox",
    "pending",
  );
  mkdirSync(pendingDir, { recursive: true });
  writeFileSync(
    join(pendingDir, "item-dispatch-1.json"),
    `${JSON.stringify(
      {
        id: "item-dispatch-1",
        missionId,
        createdAt: "2026-04-28T00:00:00.000Z",
        updatedAt: "2026-04-28T00:00:00.000Z",
        status: "pending",
        payload: {
          agent: "lunafreya",
          sessionId: "session-dispatch-1",
          parts: [{ type: "text", text: "queued prompt body" }],
          ...(options.model ? { model: options.model } : {}),
          system: "queued system body",
          ...(options.variant ? { variant: options.variant } : {}),
        },
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
}

function seedModelCatalog(root, namesByModel = {}) {
  writeFileSync(
    join(root, "runtime", "opencode-model-catalog.json"),
    `${JSON.stringify(
      {
        generatedAt: "2026-04-28T00:00:00.000Z",
        models: Object.keys(namesByModel),
        namesByModel,
        opencodeVersion: "1.3.17",
        sourceCommand: "opencode models --verbose",
        variantsByModel: {},
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
}

function seedStaleLeasedPrimaryAgentOutbox(root, missionId) {
  const leasedDir = join(
    root,
    "runtime",
    "noctis-missions",
    missionId,
    "transport",
    "primary-agent-outbox",
    "leased",
  );
  mkdirSync(leasedDir, { recursive: true });
  writeFileSync(
    join(leasedDir, "item-stale-1.json"),
    `${JSON.stringify(
      {
        id: "item-stale-1",
        missionId,
        createdAt: "2026-04-28T00:00:00.000Z",
        updatedAt: "2026-04-28T00:00:01.000Z",
        status: "leased",
        lease: {
          attempt: 1,
          leasedAt: "2026-04-28T00:00:01.000Z",
          owner: "dispatcher:old",
          staleAfterMs: 1,
        },
        payload: {
          agent: "noctis",
          sessionId: "session-stale-1",
          parts: [{ type: "text", text: "recovered stale prompt" }],
        },
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
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

  const startedAt = Date.now();
  const startResult = await runRuntimeControl(root, ["start", "--root", root]);
  const elapsedMs = Date.now() - startedAt;
  assert.equal(startResult.code, 0, startResult.stderr);

  const manifestPath = join(root, "runtime", "opencode-endpoints.json");
  const dispatcherStatePath = join(root, "runtime", "tmux-transport-dispatcher.json");
  assert.equal(existsSync(manifestPath), true);
  assert.equal(existsSync(dispatcherStatePath), true);

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  assert.equal(manifest.version, 1);
  assert.equal(Array.isArray(manifest.agents), true);
  assert.equal(manifest.agents.length, 6);
  assert.ok(elapsedMs >= (manifest.agents.length - 1) * 900, `expected staggered startup, got ${elapsedMs}ms`);

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
  assert.match(
    tmuxLog,
    /send-keys -t ff15:main\.0 .*opencode --agent noctis[\s\S]*send-keys -t ff15:main\.1 .*opencode --agent ignis[\s\S]*send-keys -t ff15:main\.2 .*opencode --agent gladiolus[\s\S]*send-keys -t ff15:main\.3 .*opencode --agent prompto[\s\S]*send-keys -t ff15:main\.4 .*opencode --agent lunafreya[\s\S]*send-keys -t ff15:main\.5 .*opencode --agent iris/,
  );

  const stopResult = await runRuntimeControl(root, ["stop", "--root", root]);
  assert.equal(stopResult.code, 0, stopResult.stderr);
});

test("dispatcher submits queued primary-agent outbox items and retains submitted artifacts", async () => {
  const root = createTempRoot();
  installFakeTmux(root);
  seedPrimaryAgentOutbox(root, "mission-dispatch");

  const startResult = await runRuntimeControl(root, ["start", "--root", root]);
  assert.equal(startResult.code, 0, startResult.stderr);

  const submittedPath = join(
    root,
    "runtime",
    "noctis-missions",
    "mission-dispatch",
    "transport",
    "primary-agent-outbox",
    "submitted",
    "item-dispatch-1.json",
  );
  assert.equal(await waitFor(() => existsSync(submittedPath), 3_000), true);

  const submitted = JSON.parse(readFileSync(submittedPath, "utf-8"));
  assert.equal(submitted.status, "submitted");
  assert.equal(typeof submitted.submission.dispatcherPid, "number");
  assert.equal(submitted.submission.submittedBy.startsWith("dispatcher:"), true);

  const tmuxLog = readFileSync(join(root, "tmux.log"), "utf-8");
  assert.match(tmuxLog, /queued prompt body/);
  assert.match(tmuxLog, /queued system body/);
  assert.match(tmuxLog, /send-keys -t ff15:main\.4 -l/);

  const stopResult = await runRuntimeControl(root, ["stop", "--root", root]);
  assert.equal(stopResult.code, 0, stopResult.stderr);
});

test("dispatcher reclaims stale leases before submitting retained artifacts", async () => {
  const root = createTempRoot();
  installFakeTmux(root);
  seedStaleLeasedPrimaryAgentOutbox(root, "mission-stale");

  const startResult = await runRuntimeControl(root, ["start", "--root", root]);
  assert.equal(startResult.code, 0, startResult.stderr);

  const submittedPath = join(
    root,
    "runtime",
    "noctis-missions",
    "mission-stale",
    "transport",
    "primary-agent-outbox",
    "submitted",
    "item-stale-1.json",
  );
  assert.equal(await waitFor(() => existsSync(submittedPath), 3_000), true);

  const submitted = JSON.parse(readFileSync(submittedPath, "utf-8"));
  assert.equal(submitted.status, "submitted");
  assert.equal(submitted.lease.attempt, 2);
  assert.equal(submitted.lease.recoveredFrom.owner, "dispatcher:old");
  assert.equal(submitted.submission.submittedBy.startsWith("dispatcher:"), true);

  const stopResult = await runRuntimeControl(root, ["stop", "--root", root]);
  assert.equal(stopResult.code, 0, stopResult.stderr);
});

test("dispatcher uses command palette flow for tmux model and variant selection", async () => {
  const root = createTempRoot();
  installFakeTmux(root);
  seedModelCatalog(root, {
    "github-copilot/gpt-5-mini": "GPT-5-mini",
  });
  seedPrimaryAgentOutbox(root, "mission-display-name", {
    model: {
      providerID: "github-copilot",
      modelID: "gpt-5-mini",
    },
    variant: "high",
  });

  const startResult = await runRuntimeControl(root, ["start", "--root", root]);
  assert.equal(startResult.code, 0, startResult.stderr);

  const submittedPath = join(
    root,
    "runtime",
    "noctis-missions",
    "mission-display-name",
    "transport",
    "primary-agent-outbox",
    "submitted",
    "item-dispatch-1.json",
  );
  assert.equal(await waitFor(() => existsSync(submittedPath), 3_000), true);

  const tmuxLog = readFileSync(join(root, "tmux.log"), "utf-8");
  const switchModelCommandIndex = tmuxLog.indexOf("send-keys -t ff15:main.4 -l Switch model");
  const displayNameIndex = tmuxLog.indexOf("send-keys -t ff15:main.4 -l GPT-5-mini");
  const switchVariantCommandIndex = tmuxLog.indexOf(
    "send-keys -t ff15:main.4 -l Switch model variant",
  );
  const variantIndex = tmuxLog.indexOf("send-keys -t ff15:main.4 -l high");
  const payloadIndex = tmuxLog.indexOf("send-keys -t ff15:main.4 -l [primary-agent-dispatch]");

  assert.match(tmuxLog, /send-keys -t ff15:main\.4 C-p/);
  assert.equal(switchModelCommandIndex >= 0, true, tmuxLog);
  assert.equal(displayNameIndex >= 0, true, tmuxLog);
  assert.equal(switchVariantCommandIndex >= 0, true, tmuxLog);
  assert.equal(variantIndex >= 0, true, tmuxLog);
  assert.equal(payloadIndex >= 0, true, tmuxLog);
  assert.equal(switchModelCommandIndex < displayNameIndex, true, tmuxLog);
  assert.equal(displayNameIndex < switchVariantCommandIndex, true, tmuxLog);
  assert.equal(switchVariantCommandIndex < variantIndex, true, tmuxLog);
  assert.equal(variantIndex < payloadIndex, true, tmuxLog);
  assert.match(
    tmuxLog,
    /send-keys -t ff15:main\.4 C-p\nsleep 0\.5\nsend-keys -t ff15:main\.4 -l Switch model/,
  );
  assert.match(
    tmuxLog,
    /send-keys -t ff15:main\.4 -l GPT-5-mini\nsleep 0\.5\nsend-keys -t ff15:main\.4 Enter\nsleep 0\.5\nsend-keys -t ff15:main\.4 C-p/,
  );
  assert.match(
    tmuxLog,
    /send-keys -t ff15:main\.4 -l high\nsleep 0\.5\nsend-keys -t ff15:main\.4 Enter\nsleep 0\.5\nsend-keys -t ff15:main\.4 -l \[primary-agent-dispatch\]/,
  );
  assert.equal((tmuxLog.match(/^sleep 0\.5$/gm) ?? []).length, 11, tmuxLog);
  assert.doesNotMatch(tmuxLog, /send-keys -t ff15:main\.4 \/models/);
  assert.doesNotMatch(tmuxLog, /send-keys -t ff15:main\.4 github-copilot\/gpt-5-mini/);

  const stopResult = await runRuntimeControl(root, ["stop", "--root", root]);
  assert.equal(stopResult.code, 0, stopResult.stderr);
});
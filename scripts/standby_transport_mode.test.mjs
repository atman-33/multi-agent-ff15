import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
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

  mkdirSync(join(root, "bin"), { recursive: true });
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

  writeFileSync(join(root, "bin", "lsof"), "#!/usr/bin/env bash\nexit 0\n", "utf-8");
  chmodSync(join(root, "bin", "lsof"), 0o755);

  return root;
}

function writeStatusControlScript(root, relativePath, payload) {
  writeFileSync(
    join(root, relativePath),
    [
      `const payload = ${JSON.stringify(payload)};`,
      "process.stdout.write(JSON.stringify(payload));",
      "",
    ].join("\n"),
    "utf-8",
  );
}

function writeExecutableScript(root, relativePath, content) {
  const filePath = join(root, relativePath);
  writeFileSync(filePath, content, "utf-8");
  chmodSync(filePath, 0o755);
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function prepareAttachStartFixture(root, runtimeState = "running") {
  mkdirSync(join(root, "web", "build", "server"), { recursive: true });
  writeFileSync(join(root, "web", "build", "server", "index.js"), "export {};\n", "utf-8");
  writeFileSync(
    join(root, "config", "settings.yaml"),
    [
      'language: "en"',
      'transport_mode: "tmux-resident"',
      'shared_skills_root: "skills"',
      'theme: "desert"',
      "",
    ].join("\n"),
    "utf-8",
  );

  writeFileSync(
    join(root, "scripts", "tmux_transport_runtime.mts"),
    [
      'import { appendFileSync } from "node:fs";',
      "const action = process.argv[2];",
      "const logPath = process.env.TMUX_RUNTIME_LOG;",
      "if (logPath) { appendFileSync(logPath, `${action}\\n`); }",
      "if (action === 'start') { process.stdout.write('{}'); process.exit(0); }",
      `if (action === 'status') { process.stdout.write(JSON.stringify(${JSON.stringify({
        state: runtimeState,
        sessionName: 'ff15',
        dispatcherPid: runtimeState === 'running' ? 4321 : null,
        endpointManifestExists: runtimeState === 'running',
      })})); process.exit(0); }`,
      "if (action === 'stop') { process.stdout.write('{}'); process.exit(0); }",
      "process.exit(1);",
      "",
    ].join("\n"),
    "utf-8",
  );

  writeExecutableScript(
    root,
    join("bin", "npm"),
    "#!/usr/bin/env bash\nexit 0\n",
  );
  writeExecutableScript(
    root,
    join("bin", "curl"),
    "#!/usr/bin/env bash\nexit 0\n",
  );
  writeExecutableScript(
    root,
    join("bin", "tmux"),
    "#!/usr/bin/env bash\nprintf '%s\\n' \"$*\" >> \"${TMUX_LOG:?}\"\nexit 0\n",
  );
}

function runStandby(root, args, envOverrides = {}, options = {}) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PATH: `${join(root, "bin")}:${process.env.PATH ?? ""}`,
      ...envOverrides,
    };
    const usePty = options.usePty === true;
    const child = usePty
      ? spawn(
          "script",
          [
            "-qefc",
            `bash ./standby.sh ${args.map(shellEscape).join(" ")}`,
            "/dev/null",
          ],
          {
            cwd: root,
            env,
          },
        )
      : spawn("bash", ["./standby.sh", ...args], {
          cwd: root,
          env,
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

test("reports dispatcher status from --status even in app-owned mode", async () => {
  const root = createTempRoot();

  writeStatusControlScript(root, join("scripts", "opencode_server_control.mts"), {
    state: "running",
    managedByApp: true,
    pid: 1234,
    url: "http://127.0.0.1:4096",
  });
  writeStatusControlScript(root, join("scripts", "tmux_transport_runtime.mts"), {
    state: "running",
    sessionName: "ff15",
    dispatcherPid: 4321,
    endpointManifestExists: true,
  });

  const result = await runStandby(root, ["--status"]);

  assert.equal(result.code, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /Web server is not running\./);
  assert.match(result.stdout, /OpenCode server is running: http:\/\/127\.0\.0\.1:4096 \(PID: 1234\)/);
  assert.match(result.stdout, /Tmux transport is running: session ff15 \(dispatcher PID: 4321\)/);
});

test("attaches to ff15 by default in interactive tmux-resident mode", async () => {
  const root = createTempRoot();
  const tmuxLog = join(root, "tmux.log");
  const runtimeLog = join(root, "tmux-runtime.log");
  prepareAttachStartFixture(root);

  const result = await runStandby(
    root,
    [],
    { TMUX: "", TMUX_LOG: tmuxLog, TMUX_RUNTIME_LOG: runtimeLog },
    { usePty: true },
  );

  assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /Reusing existing tmux transport runtime\./);
  assert.match(result.stdout, /Attaching to tmux session ff15/);
  assert.match(readFileSync(tmuxLog, "utf-8"), /attach-session -t ff15/);
  assert.match(readFileSync(runtimeLog, "utf-8"), /^status$/m);
  assert.doesNotMatch(readFileSync(runtimeLog, "utf-8"), /^start$/m);
});

test("does not auto-attach in tmux-resident mode without an interactive terminal", async () => {
  const root = createTempRoot();
  const tmuxLog = join(root, "tmux.log");
  const runtimeLog = join(root, "tmux-runtime.log");
  prepareAttachStartFixture(root);

  const result = await runStandby(root, [], {
    TMUX: "",
    TMUX_LOG: tmuxLog,
    TMUX_RUNTIME_LOG: runtimeLog,
  });

  assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
  assert.doesNotMatch(result.stdout, /Attaching to tmux session ff15/);
  assert.equal(existsSync(tmuxLog), false);
  assert.match(readFileSync(runtimeLog, "utf-8"), /^start$/m);
});

test("stays detached when --no-attach is used in interactive tmux-resident mode", async () => {
  const root = createTempRoot();
  const tmuxLog = join(root, "tmux.log");
  const runtimeLog = join(root, "tmux-runtime.log");
  prepareAttachStartFixture(root);

  const result = await runStandby(
    root,
    ["--no-attach"],
    { TMUX: "", TMUX_LOG: tmuxLog, TMUX_RUNTIME_LOG: runtimeLog },
    { usePty: true },
  );

  assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
  assert.doesNotMatch(result.stdout, /Attaching to tmux session ff15/);
  assert.equal(existsSync(tmuxLog), false);
  assert.match(readFileSync(runtimeLog, "utf-8"), /^start$/m);
});

test("attaches to ff15 when --attach is used outside tmux", async () => {
  const root = createTempRoot();
  const tmuxLog = join(root, "tmux.log");
  const runtimeLog = join(root, "tmux-runtime.log");
  prepareAttachStartFixture(root);

  const result = await runStandby(
    root,
    ["--attach"],
    { TMUX: "", TMUX_LOG: tmuxLog, TMUX_RUNTIME_LOG: runtimeLog },
    { usePty: true },
  );

  assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /Reusing existing tmux transport runtime\./);
  assert.match(result.stdout, /Attaching to tmux session ff15/);
  assert.match(readFileSync(tmuxLog, "utf-8"), /attach-session -t ff15/);
  assert.match(readFileSync(runtimeLog, "utf-8"), /^status$/m);
  assert.doesNotMatch(readFileSync(runtimeLog, "utf-8"), /^start$/m);
});

test("switches the current client when --attach is used inside tmux", async () => {
  const root = createTempRoot();
  const tmuxLog = join(root, "tmux.log");
  const runtimeLog = join(root, "tmux-runtime.log");
  prepareAttachStartFixture(root);

  const result = await runStandby(root, ["--attach"], {
    TMUX: "/tmp/fake-client,123,0",
    TMUX_LOG: tmuxLog,
    TMUX_RUNTIME_LOG: runtimeLog,
  }, { usePty: true });

  assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /Reusing existing tmux transport runtime\./);
  assert.match(result.stdout, /Switching tmux client to session ff15/);
  assert.match(readFileSync(tmuxLog, "utf-8"), /switch-client -t ff15/);
  assert.match(readFileSync(runtimeLog, "utf-8"), /^status$/m);
  assert.doesNotMatch(readFileSync(runtimeLog, "utf-8"), /^start$/m);
});

test("starts tmux transport before attaching when the runtime is down", async () => {
  const root = createTempRoot();
  const tmuxLog = join(root, "tmux.log");
  const runtimeLog = join(root, "tmux-runtime.log");
  prepareAttachStartFixture(root, "down");

  const result = await runStandby(
    root,
    ["--attach"],
    { TMUX: "", TMUX_LOG: tmuxLog, TMUX_RUNTIME_LOG: runtimeLog },
    { usePty: true },
  );

  assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /Bootstrapping tmux-resident OpenCode transport/);
  assert.match(readFileSync(tmuxLog, "utf-8"), /attach-session -t ff15/);
  assert.match(readFileSync(runtimeLog, "utf-8"), /^status$/m);
  assert.match(readFileSync(runtimeLog, "utf-8"), /^start$/m);
});
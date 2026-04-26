import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./web_server_control.mts", import.meta.url));
const tempRoots = [];

function createTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-web-control-"));
  tempRoots.push(root);
  mkdirSync(join(root, "runtime"), { recursive: true });
  mkdirSync(join(root, "web"), { recursive: true });
  writeFileSync(
    join(root, "web", "server-fixture.js"),
    [
      'const http = require("node:http");',
      'const port = Number(process.env.PORT || 3000);',
      'const server = http.createServer((_request, response) => response.end("ok"));',
      'server.listen(port);',
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(root, "web", "package.json"),
    JSON.stringify({
      name: "web-fixture",
      private: true,
      scripts: {
        start: "node ./server-fixture.js",
        dev: "node ./server-fixture.js",
      },
    }),
    "utf-8",
  );
  return root;
}

function runWebServerControl(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", scriptPath, ...args], {
      env: { ...process.env, ...options.env },
      cwd: options.cwd,
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

test("preserves an existing runtime web-server record when startup fails before readiness", async () => {
  const root = createTempRoot();
  const blocker = createServer((_request, response) => {
    response.statusCode = 200;
    response.end("occupied");
  });
  blocker.listen(0, "127.0.0.1");
  await once(blocker, "listening");
  const address = blocker.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected TCP address for blocking server");
  }

  const recordPath = join(root, "runtime", "web-server.json");
  const existingRecord = {
    version: 1,
    mode: "production",
    pid: process.pid,
    port: address.port,
    projectRoot: root,
    startedAt: "2026-04-25T00:00:00.000Z",
    url: `http://127.0.0.1:${address.port}`,
  };
  writeFileSync(recordPath, `${JSON.stringify(existingRecord, null, 2)}\n`, "utf-8");

  const result = await runWebServerControl(["start", "--root", root, "--port", String(address.port)]);

  await new Promise((resolve, reject) => {
    blocker.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /EADDRINUSE|Web server did not become ready/);
  assert.deepEqual(JSON.parse(readFileSync(recordPath, "utf-8")), existingRecord);
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./send_report.mjs", import.meta.url));
const tempRoots = [];

function createTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-send-report-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "runtime"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

function runSendReport(envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [scriptPath, "mission-test", "ignis", "task-review-1", "review", "Review complete."],
      {
        env: { ...process.env, ...envOverrides },
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
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

test("prints actionable missing-output guidance from runtime errors", async () => {
  let receivedBody = null;
  const server = createServer((request, response) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk.toString();
    });

    request.on("end", () => {
      receivedBody = JSON.parse(body);
      response.statusCode = 400;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          error: "Missing required output files",
          missingOutputs: ["/tmp/runtime/noctis-missions/test/outputs/review/task-review-1/code-review.md"],
          retryGuidance:
            "Create the missing output files at the paths above, then rerun the same scripts/send_report.sh command.",
        }),
      );
    });
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Server did not provide a TCP port");
  }

  const result = await runSendReport({ FF15_WEB_ORIGIN: `http://127.0.0.1:${address.port}` });
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Missing required output files/);
  assert.match(
    result.stderr,
    /- \/tmp\/runtime\/noctis-missions\/test\/outputs\/review\/task-review-1\/code-review\.md/,
  );
  assert.match(
    result.stderr,
    /Create the missing output files at the paths above, then rerun the same scripts\/send_report\.sh command\./,
  );
  assert.deepEqual(receivedBody, {
    fromAgent: "ignis",
    taskId: "task-review-1",
    next: "review",
    message: "Review complete.",
  });
});

test("falls back to the runtime web server state file when FF15_WEB_ORIGIN is unset", async () => {
  const root = createTempRoot();
  let receivedBody = null;
  const server = createServer((request, response) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk.toString();
    });

    request.on("end", () => {
      receivedBody = JSON.parse(body);
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ acknowledged: true }));
    });
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Server did not provide a TCP port");
  }

  writeFileSync(
    join(root, "runtime", "web-server.json"),
    `${JSON.stringify(
      {
        version: 1,
        mode: "production",
        pid: process.pid,
        port: address.port,
        projectRoot: root,
        startedAt: "2026-04-25T00:00:00.000Z",
        url: `http://127.0.0.1:${address.port}`,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  const result = await runSendReport({ MULTI_AGENT_FF15_ROOT: root });
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /acknowledged/);
  assert.deepEqual(receivedBody, {
    fromAgent: "ignis",
    taskId: "task-review-1",
    next: "review",
    message: "Review complete.",
  });
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./send_report.mjs", import.meta.url));

function runSendReport(origin) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [scriptPath, "mission-test", "ignis", "task-review-1", "review", "Review complete."],
      {
        env: { ...process.env, FF15_WEB_ORIGIN: origin },
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

  const result = await runSendReport(`http://127.0.0.1:${address.port}`);
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
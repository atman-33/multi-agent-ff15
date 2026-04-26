#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

type Command = "dev" | "start";

const SERVER_STATE_FILE = "web-server.json";

type WebServerMode = "development" | "production";

type WebServerRecord = {
  mode: WebServerMode;
  pid: number;
  port: number;
  projectRoot: string;
  startedAt: string;
  url: string;
  version: 1;
};

type WriteWebServerRecordInput = {
  mode: WebServerMode;
  pid: number;
  port: number;
  startedAt: string;
  url: string;
};

function getWebServerStatePath(root: string): string {
  return join(root, "runtime", SERVER_STATE_FILE);
}

// Keep state-file writes local so this raw Node entrypoint does not depend on bundler-resolved web modules.
function writeWebServerRecord(input: WriteWebServerRecordInput, root: string): void {
  const record: WebServerRecord = {
    version: 1,
    mode: input.mode,
    pid: input.pid,
    port: input.port,
    projectRoot: root,
    startedAt: input.startedAt,
    url: input.url,
  };

  mkdirSync(join(root, "runtime"), { recursive: true });
  writeFileSync(getWebServerStatePath(root), `${JSON.stringify(record, null, 2)}\n`, "utf-8");
}

function clearWebServerRecord(root: string): void {
  rmSync(getWebServerStatePath(root), { force: true });
}

type ParsedArgs = {
  command: Command;
  port: number;
  root: string;
};

function parseArgs(argv: string[]): ParsedArgs {
  const [commandArg, ...rest] = argv;
  if (commandArg !== "dev" && commandArg !== "start") {
    throw new Error("Usage: web_server_control.mts <dev|start> [--port <number>] [--root <path>]");
  }

  let port = Number(process.env.PORT || (commandArg === "dev" ? 5173 : 13000));
  let root = process.cwd();

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const nextValue = rest[index + 1];

    if (arg === "--port") {
      if (!nextValue) {
        throw new Error("Missing value for --port");
      }
      port = Number(nextValue);
      index += 1;
      continue;
    }

    if (arg === "--root") {
      if (!nextValue) {
        throw new Error("Missing value for --root");
      }
      root = nextValue;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid port: ${port}`);
  }

  return { command: commandArg, port, root };
}

function buildChildArgs(command: Command, port: number): string[] {
  if (command === "dev") {
    return ["run", "dev", "--", "--port", String(port)];
  }

  return ["run", "start"];
}

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status >= 200 && response.status < 400) {
        return;
      }
    } catch {
      // retry until timeout
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  throw new Error(`Web server did not become ready at ${url}`);
}

async function waitForChildStability(child: ReturnType<typeof spawn>): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 150);
  });

  if (child.exitCode !== null) {
    throw new Error(`Web server process exited with code ${child.exitCode}`);
  }

  if (child.signalCode !== null) {
    throw new Error(`Web server process exited with signal ${child.signalCode}`);
  }
}

async function main(): Promise<void> {
  const { command, port, root } = parseArgs(process.argv.slice(2));
  const url = `http://127.0.0.1:${port}`;

  const child = spawn("npm", buildChildArgs(command, port), {
    cwd: `${root}/web`,
    env: { ...process.env, PORT: String(port) },
    stdio: "inherit",
  });

  if (!child.pid) {
    throw new Error("Failed to start web server process");
  }

  let cleanedUp = false;
  let activeRecordOwnedByChild = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    if (activeRecordOwnedByChild) {
      clearWebServerRecord(root);
      activeRecordOwnedByChild = false;
    }
  };

  const forwardSignal = (signal: NodeJS.Signals) => {
    child.kill(signal);
  };

  process.on("SIGINT", () => {
    forwardSignal("SIGINT");
  });
  process.on("SIGTERM", () => {
    forwardSignal("SIGTERM");
  });
  process.on("SIGHUP", () => {
    forwardSignal("SIGHUP");
  });

  const childExit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.on("exit", (code, signal) => {
        cleanup();
        resolve({ code, signal });
      });

      child.on("error", (error) => {
        cleanup();
        reject(error);
      });
    },
  );

  try {
    await Promise.race([
      waitForServer(url),
      childExit.then(({ code, signal }) => {
        throw new Error(
          signal
            ? `Web server process exited with signal ${signal}`
            : `Web server process exited with code ${code ?? 0}`,
        );
      }),
    ]);
    await waitForChildStability(child);
    writeWebServerRecord(
      {
        mode: command === "dev" ? "development" : "production",
        pid: child.pid,
        port,
        startedAt: new Date().toISOString(),
        url,
      },
      root,
    );
    activeRecordOwnedByChild = true;
  } catch (error) {
    cleanup();
    child.kill("SIGTERM");
    try {
      await childExit;
    } catch {
      // startup failure already being handled
    }
    throw error;
  }

  const { code, signal } = await childExit;
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

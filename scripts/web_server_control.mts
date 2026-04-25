#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

import { clearWebServerRecord, writeWebServerRecord } from "../web/app/lib/web-server.ts";

type Command = "dev" | "start";

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

async function main(): Promise<void> {
  const { command, port, root } = parseArgs(process.argv.slice(2));
  const url = `http://127.0.0.1:${port}`;

  clearWebServerRecord(root);

  const child = spawn("npm", buildChildArgs(command, port), {
    cwd: `${root}/web`,
    env: { ...process.env, PORT: String(port) },
    stdio: "inherit",
  });

  if (!child.pid) {
    throw new Error("Failed to start web server process");
  }

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    clearWebServerRecord(root);
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

  child.on("exit", (code, signal) => {
    cleanup();
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on("error", (error) => {
    cleanup();
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });

  try {
    await waitForServer(url);
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
  } catch (error) {
    cleanup();
    child.kill("SIGTERM");
    throw error;
  }

  await new Promise(() => {
    // wait for child exit; handled by event listeners above
  });
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

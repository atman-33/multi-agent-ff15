#!/usr/bin/env node

import { resolve } from "node:path";
import process from "node:process";
import {
  getManagedOpencodeServerStatus,
  stopManagedOpencodeServer,
} from "../web/app/lib/opencode-server-control.server.ts";

type Command = "status" | "stop";

function parseArgs(argv: string[]): { command: Command; root: string } {
  const [commandArg, ...rest] = argv;
  if (commandArg !== "status" && commandArg !== "stop") {
    throw new Error("Usage: opencode_server_control.mts <status|stop> [--root <path>]");
  }

  let root = process.cwd();

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg !== "--root") {
      throw new Error(`Unknown option: ${arg}`);
    }

    const nextValue = rest[index + 1];
    if (!nextValue) {
      throw new Error("Missing value for --root");
    }

    root = resolve(nextValue);
    index += 1;
  }

  return {
    command: commandArg,
    root,
  };
}

async function main(): Promise<void> {
  const { command, root } = parseArgs(process.argv.slice(2));
  const result =
    command === "status"
      ? await getManagedOpencodeServerStatus(root)
      : await stopManagedOpencodeServer(root);

  process.stdout.write(`${JSON.stringify(result)}\n`);

  if (command === "stop" && "error" in result && result.error) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
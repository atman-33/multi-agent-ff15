import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DISPATCHER_STATE_FILE = "tmux-transport-dispatcher.json";

function parseRoot(argv: string[]): string {
  const rootIndex = argv.indexOf("--root");
  if (rootIndex === -1 || rootIndex === argv.length - 1) {
    throw new Error("Missing --root for tmux transport dispatcher");
  }

  return argv[rootIndex + 1];
}

function getDispatcherStatePath(root: string): string {
  return join(root, "runtime", DISPATCHER_STATE_FILE);
}

function writeState(root: string): void {
  mkdirSync(join(root, "runtime"), { recursive: true });
  writeFileSync(
    getDispatcherStatePath(root),
    `${JSON.stringify(
      {
        version: 1,
        owner: "standby",
        mode: "tmux-resident",
        pid: process.pid,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
}

function cleanup(root: string): void {
  rmSync(getDispatcherStatePath(root), { force: true });
}

const root = parseRoot(process.argv.slice(2));
writeState(root);

const exitGracefully = () => {
  cleanup(root);
  process.exit(0);
};

process.on("SIGINT", exitGracefully);
process.on("SIGTERM", exitGracefully);
process.on("exit", () => {
  cleanup(root);
});

setInterval(() => {}, 1_000);
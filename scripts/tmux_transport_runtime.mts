import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const AGENT_IDS = ["noctis", "lunafreya", "ignis", "gladiolus", "prompto", "iris"] as const;
const DEFAULT_PORTS: Record<(typeof AGENT_IDS)[number], number> = {
  noctis: 4401,
  lunafreya: 4402,
  ignis: 4403,
  gladiolus: 4404,
  prompto: 4405,
  iris: 4406,
};
const DISPATCHER_STATE_FILE = "tmux-transport-dispatcher.json";
const ENDPOINT_MANIFEST_FILE = "opencode-endpoints.json";
const PORT_RANGE_START = 4401;
const PORT_RANGE_END = 4499;
const SESSION_NAME = "ff15";
const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));

type AgentEndpointRecord = {
  agentId: (typeof AGENT_IDS)[number];
  port: number;
  url: string;
};

type DispatcherStateRecord = {
  mode: "tmux-resident";
  owner: "standby";
  pid: number;
  startedAt: string;
  version: 1;
};

function parseCli(argv: string[]): { action: "start" | "status" | "stop"; root: string } {
  const [action] = argv;
  if (action !== "start" && action !== "status" && action !== "stop") {
    throw new Error("Expected action: start, status, or stop");
  }

  const rootIndex = argv.indexOf("--root");
  if (rootIndex === -1 || rootIndex === argv.length - 1) {
    throw new Error("Missing --root for tmux transport runtime");
  }

  return {
    action,
    root: argv[rootIndex + 1],
  };
}

function getRuntimeDir(root: string): string {
  return join(root, "runtime");
}

function getEndpointManifestPath(root: string): string {
  return join(getRuntimeDir(root), ENDPOINT_MANIFEST_FILE);
}

function getDispatcherStatePath(root: string): string {
  return join(getRuntimeDir(root), DISPATCHER_STATE_FILE);
}

function runTmux(root: string, args: string[]): { code: number; stderr: string; stdout: string } {
  const result = spawnSync("tmux", args, {
    cwd: root,
    encoding: "utf-8",
  });

  return {
    code: result.status ?? 1,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readDispatcherState(root: string): DispatcherStateRecord | null {
  const path = getDispatcherStatePath(root);
  if (!existsSync(path)) {
    return null;
  }

  try {
    const record = JSON.parse(readFileSync(path, "utf-8")) as Partial<DispatcherStateRecord>;
    if (
      record.version !== 1 ||
      record.owner !== "standby" ||
      record.mode !== "tmux-resident" ||
      typeof record.pid !== "number" ||
      typeof record.startedAt !== "string"
    ) {
      return null;
    }

    return record as DispatcherStateRecord;
  } catch {
    return null;
  }
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return predicate();
}

async function isPortAvailable(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => {
      resolve(false);
    });
    server.listen(port, "127.0.0.1", () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

async function allocateAgentPorts(): Promise<Record<(typeof AGENT_IDS)[number], number>> {
  const assignedPorts = {} as Record<(typeof AGENT_IDS)[number], number>;
  const usedPorts = new Set<number>();

  for (const agentId of AGENT_IDS) {
    const preferredPort = DEFAULT_PORTS[agentId];
    if (!usedPorts.has(preferredPort) && (await isPortAvailable(preferredPort))) {
      assignedPorts[agentId] = preferredPort;
      usedPorts.add(preferredPort);
      continue;
    }

    let allocatedPort = 0;
    for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port += 1) {
      if (usedPorts.has(port)) {
        continue;
      }

      if (await isPortAvailable(port)) {
        allocatedPort = port;
        break;
      }
    }

    if (allocatedPort === 0) {
      throw new Error(`Failed to allocate an OpenCode port for ${agentId}`);
    }

    assignedPorts[agentId] = allocatedPort;
    usedPorts.add(allocatedPort);
  }

  return assignedPorts;
}

function ensureTmuxSession(root: string): void {
  const hasSession = runTmux(root, ["has-session", "-t", SESSION_NAME]);
  if (hasSession.code === 0) {
    return;
  }

  const createSession = runTmux(root, ["new-session", "-d", "-s", SESSION_NAME, "-n", "main", "-x", "200", "-y", "50"]);
  if (createSession.code !== 0) {
    throw new Error(createSession.stderr || `Failed to create tmux session ${SESSION_NAME}`);
  }

  const layoutCommands = [
    ["split-window", "-v", "-l", "50%", "-t", `${SESSION_NAME}:main.0`],
    ["split-window", "-h", "-l", "50%", "-t", `${SESSION_NAME}:main.0`],
    ["split-window", "-h", "-l", "75%", "-t", `${SESSION_NAME}:main.2`],
    ["split-window", "-h", "-l", "66%", "-t", `${SESSION_NAME}:main.3`],
    ["split-window", "-h", "-l", "50%", "-t", `${SESSION_NAME}:main.4`],
    ["select-layout", "-t", `${SESSION_NAME}:main`, "tiled"],
  ];

  for (const command of layoutCommands) {
    const result = runTmux(root, command);
    if (result.code !== 0) {
      throw new Error(result.stderr || `Failed tmux command: ${command.join(" ")}`);
    }
  }
}

function writeEndpointManifest(root: string, assignedPorts: Record<(typeof AGENT_IDS)[number], number>): AgentEndpointRecord[] {
  mkdirSync(getRuntimeDir(root), { recursive: true });
  const agents = AGENT_IDS.map((agentId) => ({
    agentId,
    port: assignedPorts[agentId],
    url: `http://127.0.0.1:${assignedPorts[agentId]}`,
  }));

  writeFileSync(
    getEndpointManifestPath(root),
    `${JSON.stringify(
      {
        version: 1,
        startedAt: new Date().toISOString(),
        agents,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  return agents;
}

function launchAgentRoster(root: string, agents: AgentEndpointRecord[]): void {
  for (const [index, agent] of agents.entries()) {
    const target = `${SESSION_NAME}:main.${index}`;
    const launchCommand = [
      `cd ${JSON.stringify(root)}`,
      `export AGENT_ID=${agent.agentId}`,
      "export OPENCODE_EXPERIMENTAL_FILEWATCHER=true",
      `opencode --agent ${agent.agentId} --hostname 127.0.0.1 --port ${agent.port}`,
    ].join(" && ");

    const sendCommand = runTmux(root, ["send-keys", "-t", target, launchCommand]);
    if (sendCommand.code !== 0) {
      throw new Error(sendCommand.stderr || `Failed to send roster launch command for ${agent.agentId}`);
    }

    const sendEnter = runTmux(root, ["send-keys", "-t", target, "Enter"]);
    if (sendEnter.code !== 0) {
      throw new Error(sendEnter.stderr || `Failed to confirm roster launch command for ${agent.agentId}`);
    }
  }
}

async function ensureDispatcher(root: string): Promise<DispatcherStateRecord> {
  const existingState = readDispatcherState(root);
  if (existingState && isProcessAlive(existingState.pid)) {
    return existingState;
  }

  rmSync(getDispatcherStatePath(root), { force: true });

  const dispatcherScriptPath = join(SCRIPT_DIR, "tmux_transport_dispatcher.mts");
  const child = spawn(process.execPath, ["--experimental-strip-types", dispatcherScriptPath, "--root", root], {
    cwd: root,
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  const ready = await waitFor(() => {
    const state = readDispatcherState(root);
    return !!state && isProcessAlive(state.pid);
  }, 2_000);
  if (!ready) {
    throw new Error("Tmux transport dispatcher did not become ready in time");
  }

  const state = readDispatcherState(root);
  if (!state) {
    throw new Error("Tmux transport dispatcher state file is missing");
  }

  return state;
}

async function stopDispatcher(root: string): Promise<boolean> {
  const state = readDispatcherState(root);
  if (!state) {
    rmSync(getDispatcherStatePath(root), { force: true });
    return false;
  }

  if (isProcessAlive(state.pid)) {
    process.kill(state.pid, "SIGTERM");
    await waitFor(() => !isProcessAlive(state.pid), 2_000);
  }

  rmSync(getDispatcherStatePath(root), { force: true });
  return true;
}

async function start(root: string): Promise<void> {
  ensureTmuxSession(root);
  const assignedPorts = await allocateAgentPorts();
  const agents = writeEndpointManifest(root, assignedPorts);
  launchAgentRoster(root, agents);
  const dispatcher = await ensureDispatcher(root);

  process.stdout.write(
    `${JSON.stringify(
      {
        state: "running",
        sessionName: SESSION_NAME,
        agentCount: agents.length,
        dispatcherPid: dispatcher.pid,
        endpointManifestPath: getEndpointManifestPath(root),
        dispatcherStatePath: getDispatcherStatePath(root),
      },
      null,
      2,
    )}\n`,
  );
}

async function stop(root: string): Promise<void> {
  const dispatcherStopped = await stopDispatcher(root);
  rmSync(getEndpointManifestPath(root), { force: true });
  runTmux(root, ["kill-session", "-t", SESSION_NAME]);

  process.stdout.write(
    `${JSON.stringify(
      {
        state: "stopped",
        sessionName: SESSION_NAME,
        dispatcherStopped,
      },
      null,
      2,
    )}\n`,
  );
}

function status(root: string): void {
  const dispatcherState = readDispatcherState(root);
  const sessionStatus = runTmux(root, ["has-session", "-t", SESSION_NAME]);
  process.stdout.write(
    `${JSON.stringify(
      {
        state:
          sessionStatus.code === 0 && dispatcherState && isProcessAlive(dispatcherState.pid)
            ? "running"
            : "down",
        sessionName: SESSION_NAME,
        hasSession: sessionStatus.code === 0,
        endpointManifestPath: getEndpointManifestPath(root),
        endpointManifestExists: existsSync(getEndpointManifestPath(root)),
        dispatcherStatePath: getDispatcherStatePath(root),
        dispatcherPid: dispatcherState?.pid ?? null,
        dispatcherRunning: dispatcherState ? isProcessAlive(dispatcherState.pid) : false,
      },
      null,
      2,
    )}\n`,
  );
}

const { action, root } = parseCli(process.argv.slice(2));

try {
  switch (action) {
    case "start":
      await start(root);
      break;
    case "status":
      status(root);
      break;
    case "stop":
      await stop(root);
      break;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
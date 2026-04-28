import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const AGENT_IDS = ["noctis", "lunafreya", "ignis", "gladiolus", "prompto", "iris"] as const;
const DISPATCHER_STATE_FILE = "tmux-transport-dispatcher.json";
const LOOP_INTERVAL_MS = 200;
const MISSION_STORE_DIR = "noctis-missions";
const SESSION_NAME = "ff15";
const STALE_LEASE_MS = 5_000;

type AgentId = (typeof AGENT_IDS)[number];
type PrimaryAgentOutboxStatus = "pending" | "leased" | "submitted";

type PrimaryAgentOutboxItem = {
  createdAt: string;
  id: string;
  lease?: {
    attempt: number;
    leasedAt: string;
    owner: string;
    staleAfterMs: number;
    recoveredFrom?: {
      attempt: number;
      leasedAt: string;
      owner: string;
      staleAfterMs: number;
    };
  };
  missionId: string;
  payload: {
    agent: AgentId;
    model?: {
      modelID: string;
      providerID: string;
    };
    parts: Array<{
      text: string;
      type: "text";
    }>;
    sessionId: string;
    system?: string;
    variant?: string;
  };
  status: PrimaryAgentOutboxStatus;
  submission?: {
    dispatcherPid?: number;
    submittedAt: string;
    submittedBy: string;
  };
  updatedAt: string;
};

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

function getMissionStorePath(root: string): string {
  return join(root, "runtime", MISSION_STORE_DIR);
}

function getOutboxStateDir(
  root: string,
  missionId: string,
  status: PrimaryAgentOutboxStatus,
): string {
  return join(getMissionStorePath(root), missionId, "transport", "primary-agent-outbox", status);
}

function getOutboxItemPath(
  root: string,
  missionId: string,
  status: PrimaryAgentOutboxStatus,
  itemId: string,
): string {
  return join(getOutboxStateDir(root, missionId, status), `${itemId}.json`);
}

function writeState(root: string, extra: Record<string, unknown> = {}): void {
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
        ...extra,
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

function isOutboxStatus(value: unknown): value is PrimaryAgentOutboxStatus {
  return value === "pending" || value === "leased" || value === "submitted";
}

function isAgentId(value: unknown): value is AgentId {
  return AGENT_IDS.some((agentId) => agentId === value);
}

function normalizeItem(value: unknown): PrimaryAgentOutboxItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.missionId !== "string" ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string" ||
    !isOutboxStatus(record.status)
  ) {
    return null;
  }

  const payload = record.payload;
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const payloadRecord = payload as Record<string, unknown>;
  if (
    !isAgentId(payloadRecord.agent) ||
    typeof payloadRecord.sessionId !== "string" ||
    !Array.isArray(payloadRecord.parts) ||
    payloadRecord.parts.some(
      (part) =>
        !part ||
        typeof part !== "object" ||
        (part as Record<string, unknown>).type !== "text" ||
        typeof (part as Record<string, unknown>).text !== "string",
    )
  ) {
    return null;
  }

  return record as PrimaryAgentOutboxItem;
}

function listMissionIds(root: string): string[] {
  const missionStorePath = getMissionStorePath(root);
  if (!existsSync(missionStorePath)) {
    return [];
  }

  return readdirSync(missionStorePath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function readItemsForStatus(
  root: string,
  missionId: string,
  status: PrimaryAgentOutboxStatus,
): PrimaryAgentOutboxItem[] {
  const dir = getOutboxStateDir(root, missionId, status);
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => {
      try {
        return normalizeItem(JSON.parse(readFileSync(join(dir, entry), "utf-8")));
      } catch {
        return null;
      }
    })
    .filter((item): item is PrimaryAgentOutboxItem => item !== null);
}

function compareItems(left: PrimaryAgentOutboxItem, right: PrimaryAgentOutboxItem): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function isStale(item: PrimaryAgentOutboxItem, now: string): boolean {
  if (!item.lease) {
    return false;
  }

  const leasedAt = Date.parse(item.lease.leasedAt);
  const checkedAt = Date.parse(now);
  if (Number.isNaN(leasedAt) || Number.isNaN(checkedAt)) {
    return false;
  }

  return checkedAt - leasedAt > item.lease.staleAfterMs;
}

function writeItem(root: string, item: PrimaryAgentOutboxItem): void {
  for (const status of ["pending", "leased", "submitted"] as const) {
    mkdirSync(getOutboxStateDir(root, item.missionId, status), { recursive: true });
    rmSync(getOutboxItemPath(root, item.missionId, status, item.id), { force: true });
  }

  writeFileSync(
    getOutboxItemPath(root, item.missionId, item.status, item.id),
    `${JSON.stringify(item, null, 2)}\n`,
    "utf-8",
  );
}

function claimNextItem(root: string, now: string): PrimaryAgentOutboxItem | null {
  const candidates = listMissionIds(root).flatMap((missionId) => {
    const pending = readItemsForStatus(root, missionId, "pending");
    const staleLeased = readItemsForStatus(root, missionId, "leased").filter((item) => isStale(item, now));
    return [...pending, ...staleLeased];
  });
  const candidate = candidates.sort(compareItems)[0] ?? null;

  if (!candidate) {
    return null;
  }

  const claimed: PrimaryAgentOutboxItem = {
    ...candidate,
    status: "leased",
    updatedAt: now,
    lease: {
      attempt: (candidate.lease?.attempt ?? 0) + 1,
      leasedAt: now,
      owner: `dispatcher:${process.pid}`,
      staleAfterMs: candidate.lease?.staleAfterMs ?? STALE_LEASE_MS,
      ...(candidate.lease
        ? {
            recoveredFrom: {
              attempt: candidate.lease.attempt,
              leasedAt: candidate.lease.leasedAt,
              owner: candidate.lease.owner,
              staleAfterMs: candidate.lease.staleAfterMs,
            },
          }
        : {}),
    },
  };

  writeItem(root, claimed);
  return claimed;
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

function buildDispatchText(item: PrimaryAgentOutboxItem): string {
  const header = [
    `[primary-agent-dispatch] mission=${item.missionId}`,
    `session=${item.payload.sessionId}`,
    `agent=${item.payload.agent}`,
  ].join(" ");

  return [
    header,
    item.payload.model
      ? `model=${item.payload.model.providerID}/${item.payload.model.modelID}`
      : null,
    item.payload.variant ? `variant=${item.payload.variant}` : null,
    item.payload.system ?? null,
    ...item.payload.parts.map((part) => part.text),
  ]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n\n");
}

function applyModelSelection(root: string, target: string, item: PrimaryAgentOutboxItem): void {
  if (!item.payload.model) {
    return;
  }

  const openModelPicker = runTmux(root, ["send-keys", "-t", target, "/models"]);
  if (openModelPicker.code !== 0) {
    throw new Error(openModelPicker.stderr || `Failed to open model picker for ${target}`);
  }

  const submitModelPicker = runTmux(root, ["send-keys", "-t", target, "Enter"]);
  if (submitModelPicker.code !== 0) {
    throw new Error(submitModelPicker.stderr || `Failed to confirm model picker for ${target}`);
  }

  const modelRef = `${item.payload.model.providerID}/${item.payload.model.modelID}`;
  const sendModel = runTmux(root, ["send-keys", "-t", target, modelRef]);
  if (sendModel.code !== 0) {
    throw new Error(sendModel.stderr || `Failed to select model ${modelRef} for ${target}`);
  }

  const submitModel = runTmux(root, ["send-keys", "-t", target, "Enter"]);
  if (submitModel.code !== 0) {
    throw new Error(submitModel.stderr || `Failed to confirm model ${modelRef} for ${target}`);
  }

  if (!item.payload.variant) {
    return;
  }

  const sendVariant = runTmux(root, ["send-keys", "-t", target, item.payload.variant]);
  if (sendVariant.code !== 0) {
    throw new Error(sendVariant.stderr || `Failed to select variant ${item.payload.variant} for ${target}`);
  }

  const submitVariant = runTmux(root, ["send-keys", "-t", target, "Enter"]);
  if (submitVariant.code !== 0) {
    throw new Error(
      submitVariant.stderr || `Failed to confirm variant ${item.payload.variant} for ${target}`,
    );
  }
}

function submitClaimedItem(root: string, item: PrimaryAgentOutboxItem): void {
  const paneIndex = AGENT_IDS.indexOf(item.payload.agent);
  if (paneIndex === -1) {
    throw new Error(`Unsupported primary-agent outbox target: ${item.payload.agent}`);
  }

  const target = `${SESSION_NAME}:main.${paneIndex}`;
  const payload = buildDispatchText(item);
  applyModelSelection(root, target, item);
  const sendPayload = runTmux(root, ["send-keys", "-t", target, "-l", payload]);
  if (sendPayload.code !== 0) {
    throw new Error(sendPayload.stderr || `Failed to send outbox payload to ${target}`);
  }

  const sendEnter = runTmux(root, ["send-keys", "-t", target, "Enter"]);
  if (sendEnter.code !== 0) {
    throw new Error(sendEnter.stderr || `Failed to submit outbox payload to ${target}`);
  }

  writeItem(root, {
    ...item,
    status: "submitted",
    updatedAt: new Date().toISOString(),
    submission: {
      dispatcherPid: process.pid,
      submittedAt: new Date().toISOString(),
      submittedBy: `dispatcher:${process.pid}`,
    },
  });
}

function countQueuedItems(root: string): number {
  return listMissionIds(root).reduce((total, missionId) => {
    return total + readItemsForStatus(root, missionId, "pending").length + readItemsForStatus(root, missionId, "leased").length;
  }, 0);
}

const root = parseRoot(process.argv.slice(2));
let processedCount = 0;
const dispatcherStartedAt = new Date().toISOString();

const tick = () => {
  try {
    const now = new Date().toISOString();
    const claimed = claimNextItem(root, now);
    if (claimed) {
      submitClaimedItem(root, claimed);
      processedCount += 1;
    }

    writeState(root, {
      lastActivityAt: now,
      processedCount,
      queuedCount: countQueuedItems(root),
      startedAt: dispatcherStartedAt,
    });
  } catch (error) {
    writeState(root, {
      lastActivityAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : String(error),
      processedCount,
      queuedCount: countQueuedItems(root),
      startedAt: dispatcherStartedAt,
    });
  }
};

writeState(root, {
  processedCount,
  queuedCount: countQueuedItems(root),
  startedAt: dispatcherStartedAt,
});
tick();
const interval = setInterval(tick, LOOP_INTERVAL_MS);

const exitGracefully = () => {
  clearInterval(interval);
  cleanup(root);
  process.exit(0);
};

process.on("SIGINT", exitGracefully);
process.on("SIGTERM", exitGracefully);
process.on("exit", () => {
  clearInterval(interval);
  cleanup(root);
});
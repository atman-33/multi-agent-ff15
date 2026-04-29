import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const AGENT_IDS = ["noctis", "ignis", "gladiolus", "prompto", "lunafreya", "iris"] as const;
const DISPATCHER_STATE_FILE = "tmux-transport-dispatcher.json";
const LOOP_INTERVAL_MS = 200;
const NEXT_DISPATCH_DELAY_MS = 3_000;
const MISSION_STORE_DIR = "noctis-missions";
const SESSION_NAME = "ff15";
const STALE_LEASE_MS = 5_000;
const TMUX_INTERACTION_DELAY_SECONDS = "0.5";

type AgentId = (typeof AGENT_IDS)[number];
type TmuxDispatchStatus = "pending" | "leased" | "submitted" | "failed" | "cancelled";

type TmuxDispatchItem = {
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
    sessionTitle?: string;
    system?: string;
    variant?: string;
  };
  status: TmuxDispatchStatus;
  submission?: {
    dispatcherPid?: number;
    submittedAt: string;
    submittedBy: string;
  };
  failure?: {
    dispatcherPid?: number;
    failedAt: string;
    failedBy: string;
    reason: string;
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
  status: TmuxDispatchStatus,
): string {
  return join(getMissionStorePath(root), missionId, "transport", "primary-agent-outbox", status);
}

function getOutboxItemPath(
  root: string,
  missionId: string,
  status: TmuxDispatchStatus,
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

function isOutboxStatus(value: unknown): value is TmuxDispatchStatus {
  return (
    value === "pending" ||
    value === "leased" ||
    value === "submitted" ||
    value === "failed" ||
    value === "cancelled"
  );
}

function isAgentId(value: unknown): value is AgentId {
  return AGENT_IDS.some((agentId) => agentId === value);
}

function normalizeItem(value: unknown): TmuxDispatchItem | null {
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

  return record as TmuxDispatchItem;
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
  status: TmuxDispatchStatus,
): TmuxDispatchItem[] {
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
    .filter((item): item is TmuxDispatchItem => item !== null);
}

function compareItems(left: TmuxDispatchItem, right: TmuxDispatchItem): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function isStale(item: TmuxDispatchItem, now: string): boolean {
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

function writeItem(root: string, item: TmuxDispatchItem): void {
  for (const status of ["pending", "leased", "submitted", "failed", "cancelled"] as const) {
    mkdirSync(getOutboxStateDir(root, item.missionId, status), { recursive: true });
    rmSync(getOutboxItemPath(root, item.missionId, status, item.id), { force: true });
  }

  writeFileSync(
    getOutboxItemPath(root, item.missionId, item.status, item.id),
    `${JSON.stringify(item, null, 2)}\n`,
    "utf-8",
  );
}

function claimNextItem(root: string, now: string): TmuxDispatchItem | null {
  const candidates = listMissionIds(root).flatMap((missionId) => {
    const pending = readItemsForStatus(root, missionId, "pending");
    const staleLeased = readItemsForStatus(root, missionId, "leased").filter((item) => isStale(item, now));
    return [...pending, ...staleLeased];
  });
  const candidate = candidates.sort(compareItems)[0] ?? null;

  if (!candidate) {
    return null;
  }

  const claimed: TmuxDispatchItem = {
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

function waitForTmuxInteraction(root: string): void {
  const result = spawnSync("sleep", [TMUX_INTERACTION_DELAY_SECONDS], {
    cwd: root,
    encoding: "utf-8",
  });

  if ((result.status ?? 1) !== 0) {
    throw new Error(
      result.stderr ?? `Failed to wait ${TMUX_INTERACTION_DELAY_SECONDS}s between tmux inputs`,
    );
  }
}

function sendTmuxKeys(
  root: string,
  target: string,
  args: string[],
  errorMessage: string,
  interactionState: { hasSentInput: boolean },
): void {
  if (interactionState.hasSentInput) {
    waitForTmuxInteraction(root);
  }

  const result = runTmux(root, ["send-keys", "-t", target, ...args]);
  if (result.code !== 0) {
    throw new Error(result.stderr || errorMessage);
  }

  interactionState.hasSentInput = true;
}

function readCatalogModelSelectionText(
  root: string,
  model: NonNullable<TmuxDispatchItem["payload"]["model"]>,
): string | null {
  const modelKey = `${model.providerID}/${model.modelID}`;
  const catalogPath = join(root, "runtime", "opencode-model-catalog.json");
  if (!existsSync(catalogPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(catalogPath, "utf-8")) as {
      namesByModel?: Record<string, unknown>;
    };
    const displayName = parsed.namesByModel?.[modelKey];
    return typeof displayName === "string" && displayName.length > 0 ? displayName : null;
  } catch {
    return null;
  }
}

function buildDispatchText(item: TmuxDispatchItem): string {
  const header = [
    `[tmux-dispatch] mission=${item.missionId}`,
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

function resolveManagedSessionTitle(item: TmuxDispatchItem): string {
  if (typeof item.payload.sessionTitle === "string" && item.payload.sessionTitle.length > 0) {
    return item.payload.sessionTitle;
  }

  return `mission:${item.missionId}`;
}

function activateManagedSession(
  root: string,
  target: string,
  item: TmuxDispatchItem,
  interactionState: { hasSentInput: boolean },
): void {
  const sessionTitle = resolveManagedSessionTitle(item);
  sendTmuxKeys(root, target, ["C-p"], `Failed to open command palette for ${target}`, interactionState);
  sendTmuxKeys(
    root,
    target,
    ["-l", "Switch session"],
    `Failed to queue session switch command for ${target}`,
    interactionState,
  );
  sendTmuxKeys(root, target, ["Enter"], `Failed to submit session switch command for ${target}`, interactionState);
  sendTmuxKeys(
    root,
    target,
    ["-l", sessionTitle],
    `Failed to select session ${sessionTitle} for ${target}`,
    interactionState,
  );
  sendTmuxKeys(
    root,
    target,
    ["Enter"],
    `Failed to confirm session ${sessionTitle} for ${target}`,
    interactionState,
  );
}

function applyModelSelection(
  root: string,
  target: string,
  item: TmuxDispatchItem,
  interactionState: { hasSentInput: boolean },
): void {
  if (!item.payload.model) {
    return;
  }

  const modelRef = `${item.payload.model.providerID}/${item.payload.model.modelID}`;
  const selectionText = readCatalogModelSelectionText(root, item.payload.model) ?? modelRef;
  sendTmuxKeys(root, target, ["C-p"], `Failed to open command palette for ${target}`, interactionState);
  sendTmuxKeys(
    root,
    target,
    ["-l", "Switch model"],
    `Failed to queue model command for ${target}`,
    interactionState,
  );
  sendTmuxKeys(root, target, ["Enter"], `Failed to submit model command for ${target}`, interactionState);
  sendTmuxKeys(
    root,
    target,
    ["-l", selectionText],
    `Failed to select model ${selectionText} for ${target}`,
    interactionState,
  );
  sendTmuxKeys(
    root,
    target,
    ["Enter"],
    `Failed to confirm model ${selectionText} for ${target}`,
    interactionState,
  );

  if (!item.payload.variant) {
    return;
  }

  sendTmuxKeys(root, target, ["C-p"], `Failed to reopen command palette for ${target}`, interactionState);
  sendTmuxKeys(
    root,
    target,
    ["-l", "Switch model variant"],
    `Failed to queue model variant command for ${target}`,
    interactionState,
  );
  sendTmuxKeys(
    root,
    target,
    ["Enter"],
    `Failed to submit model variant command for ${target}`,
    interactionState,
  );
  sendTmuxKeys(
    root,
    target,
    ["-l", item.payload.variant],
    `Failed to select variant ${item.payload.variant} for ${target}`,
    interactionState,
  );
  sendTmuxKeys(
    root,
    target,
    ["Enter"],
    `Failed to confirm variant ${item.payload.variant} for ${target}`,
    interactionState,
  );
}

function submitClaimedItem(root: string, item: TmuxDispatchItem): void {
  const paneIndex = AGENT_IDS.indexOf(item.payload.agent);
  if (paneIndex === -1) {
    throw new Error(`Unsupported tmux dispatch target: ${item.payload.agent}`);
  }

  const target = `${SESSION_NAME}:main.${paneIndex}`;
  const payload = buildDispatchText(item);
  const interactionState = { hasSentInput: false };
  activateManagedSession(root, target, item, interactionState);
  applyModelSelection(root, target, item, interactionState);
  sendTmuxKeys(root, target, ["-l", payload], `Failed to send outbox payload to ${target}`, interactionState);
  sendTmuxKeys(root, target, ["Enter"], `Failed to submit outbox payload to ${target}`, interactionState);

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
let nextDispatchNotBefore = 0;
const dispatcherStartedAt = new Date().toISOString();

const tick = () => {
  let claimed: TmuxDispatchItem | null = null;

  try {
    const nowDate = new Date();
    const now = nowDate.toISOString();
    claimed = nowDate.getTime() >= nextDispatchNotBefore ? claimNextItem(root, now) : null;
    if (claimed) {
      submitClaimedItem(root, claimed);
      processedCount += 1;
      nextDispatchNotBefore = Date.now() + NEXT_DISPATCH_DELAY_MS;
    }

    writeState(root, {
      lastActivityAt: now,
      processedCount,
      queuedCount: countQueuedItems(root),
      startedAt: dispatcherStartedAt,
    });
  } catch (error) {
    if (claimed) {
      const failedAt = new Date().toISOString();
      writeItem(root, {
        ...claimed,
        status: "failed",
        updatedAt: failedAt,
        failure: {
          dispatcherPid: process.pid,
          failedAt,
          failedBy: `dispatcher:${process.pid}`,
          reason: error instanceof Error ? error.message : String(error),
        },
      });
    }

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
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getMissionDir } from "./mission-store";
import type { TextPromptPart } from "./prompt-parts";
import type { AgentId, ModelSelection } from "./types/mission";

const PRIMARY_AGENT_OUTBOX_DIR = "primary-agent-outbox";
const OUTBOX_STATUSES = ["pending", "leased", "submitted"] as const;

export type PrimaryAgentOutboxStatus = (typeof OUTBOX_STATUSES)[number];

export interface PrimaryAgentOutboxRecoveredLease {
  attempt: number;
  leasedAt: string;
  owner: string;
  staleAfterMs: number;
}

export interface PrimaryAgentOutboxLease {
  attempt: number;
  leasedAt: string;
  owner: string;
  staleAfterMs: number;
  recoveredFrom?: PrimaryAgentOutboxRecoveredLease;
}

export interface PrimaryAgentOutboxSubmission {
  dispatcherPid?: number;
  submittedAt: string;
  submittedBy: string;
}

export interface PrimaryAgentOutboxPayload {
  agent: AgentId;
  sessionId: string;
  sessionTitle?: string;
  parts: TextPromptPart[];
  system?: string;
  model?: Pick<ModelSelection, "providerID" | "modelID">;
  variant?: string;
}

export interface PrimaryAgentOutboxItem {
  id: string;
  missionId: string;
  createdAt: string;
  updatedAt: string;
  status: PrimaryAgentOutboxStatus;
  payload: PrimaryAgentOutboxPayload;
  lease?: PrimaryAgentOutboxLease;
  submission?: PrimaryAgentOutboxSubmission;
}

function isOutboxStatus(value: unknown): value is PrimaryAgentOutboxStatus {
  return OUTBOX_STATUSES.some((status) => status === value);
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function normalizePromptParts(value: unknown): TextPromptPart[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const parts = value
    .map((part) => {
      if (!part || typeof part !== "object") {
        return null;
      }

      const record = part as Record<string, unknown>;
      if (record.type !== "text" || typeof record.text !== "string") {
        return null;
      }

      return {
        type: "text" as const,
        text: record.text,
      };
    })
    .filter((part): part is TextPromptPart => part !== null);

  return parts.length === value.length ? parts : null;
}

function normalizePayload(value: unknown): PrimaryAgentOutboxPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const agent = normalizeString(record.agent);
  const sessionId = normalizeString(record.sessionId);
  const parts = normalizePromptParts(record.parts);

  if (!agent || !sessionId || !parts) {
    return null;
  }

  return {
    agent: agent as AgentId,
    sessionId,
    ...(normalizeString(record.sessionTitle)
      ? { sessionTitle: normalizeString(record.sessionTitle) }
      : {}),
    parts,
    ...(normalizeString(record.system) ? { system: normalizeString(record.system) } : {}),
    ...(record.model && typeof record.model === "object"
      ? {
          model: {
            providerID: (record.model as Record<string, unknown>).providerID as string,
            modelID: (record.model as Record<string, unknown>).modelID as string,
          },
        }
      : {}),
    ...(normalizeString(record.variant) ? { variant: normalizeString(record.variant) } : {}),
  };
}

function normalizeRecoveredLease(value: unknown): PrimaryAgentOutboxRecoveredLease | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.attempt !== "number" ||
    typeof record.leasedAt !== "string" ||
    typeof record.owner !== "string" ||
    typeof record.staleAfterMs !== "number"
  ) {
    return undefined;
  }

  return {
    attempt: record.attempt,
    leasedAt: record.leasedAt,
    owner: record.owner,
    staleAfterMs: record.staleAfterMs,
  };
}

function normalizeLease(value: unknown): PrimaryAgentOutboxLease | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.attempt !== "number" ||
    typeof record.leasedAt !== "string" ||
    typeof record.owner !== "string" ||
    typeof record.staleAfterMs !== "number"
  ) {
    return undefined;
  }

  return {
    attempt: record.attempt,
    leasedAt: record.leasedAt,
    owner: record.owner,
    staleAfterMs: record.staleAfterMs,
    ...(normalizeRecoveredLease(record.recoveredFrom)
      ? { recoveredFrom: normalizeRecoveredLease(record.recoveredFrom) }
      : {}),
  };
}

function normalizeSubmission(value: unknown): PrimaryAgentOutboxSubmission | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.submittedAt !== "string" || typeof record.submittedBy !== "string") {
    return undefined;
  }

  return {
    submittedAt: record.submittedAt,
    submittedBy: record.submittedBy,
    ...(typeof record.dispatcherPid === "number" ? { dispatcherPid: record.dispatcherPid } : {}),
  };
}

function normalizeItem(value: unknown): PrimaryAgentOutboxItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = normalizeString(record.id);
  const missionId = normalizeString(record.missionId);
  const createdAt = normalizeString(record.createdAt);
  const updatedAt = normalizeString(record.updatedAt);
  const payload = normalizePayload(record.payload);

  if (!id || !missionId || !createdAt || !updatedAt || !isOutboxStatus(record.status) || !payload) {
    return null;
  }

  return {
    id,
    missionId,
    createdAt,
    updatedAt,
    status: record.status,
    payload,
    ...(normalizeLease(record.lease) ? { lease: normalizeLease(record.lease) } : {}),
    ...(normalizeSubmission(record.submission)
      ? { submission: normalizeSubmission(record.submission) }
      : {}),
  };
}

function compareItems(left: PrimaryAgentOutboxItem, right: PrimaryAgentOutboxItem): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function ensurePrimaryAgentOutboxDirs(missionId: string): void {
  for (const status of OUTBOX_STATUSES) {
    mkdirSync(getMissionPrimaryAgentOutboxStateDir(missionId, status), { recursive: true });
  }
}

function getPrimaryAgentOutboxItemPath(
  missionId: string,
  status: PrimaryAgentOutboxStatus,
  itemId: string,
): string {
  return join(getMissionPrimaryAgentOutboxStateDir(missionId, status), `${itemId}.json`);
}

function writeItem(item: PrimaryAgentOutboxItem, previousStatus?: PrimaryAgentOutboxStatus): void {
  ensurePrimaryAgentOutboxDirs(item.missionId);

  for (const status of OUTBOX_STATUSES) {
    if (status === item.status || status === previousStatus) {
      rmSync(getPrimaryAgentOutboxItemPath(item.missionId, status, item.id), { force: true });
    }
  }

  writeFileSync(
    getPrimaryAgentOutboxItemPath(item.missionId, item.status, item.id),
    `${JSON.stringify(item, null, 2)}\n`,
    "utf-8",
  );
}

function readItemsForStatus(
  missionId: string,
  status: PrimaryAgentOutboxStatus,
): PrimaryAgentOutboxItem[] {
  const dir = getMissionPrimaryAgentOutboxStateDir(missionId, status);
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
    .filter((item): item is PrimaryAgentOutboxItem => item !== null)
    .sort(compareItems);
}

function findItem(
  missionId: string,
  itemId: string,
): { item: PrimaryAgentOutboxItem; status: PrimaryAgentOutboxStatus } | null {
  for (const status of OUTBOX_STATUSES) {
    const path = getPrimaryAgentOutboxItemPath(missionId, status, itemId);
    if (!existsSync(path)) {
      continue;
    }

    try {
      const item = normalizeItem(JSON.parse(readFileSync(path, "utf-8")));
      if (item) {
        return { item, status };
      }
    } catch {
      return null;
    }
  }

  return null;
}

function isStaleLease(item: PrimaryAgentOutboxItem, leasedAt: string): boolean {
  if (item.status !== "leased" || !item.lease) {
    return false;
  }

  const leaseStartedAt = Date.parse(item.lease.leasedAt);
  const leaseCheckedAt = Date.parse(leasedAt);
  if (Number.isNaN(leaseStartedAt) || Number.isNaN(leaseCheckedAt)) {
    return false;
  }

  return leaseCheckedAt - leaseStartedAt > item.lease.staleAfterMs;
}

export function getMissionPrimaryAgentOutboxDir(missionId: string): string {
  return join(getMissionDir(missionId), "transport", PRIMARY_AGENT_OUTBOX_DIR);
}

export function getMissionPrimaryAgentOutboxStateDir(
  missionId: string,
  status: PrimaryAgentOutboxStatus,
): string {
  return join(getMissionPrimaryAgentOutboxDir(missionId), status);
}

export function enqueuePrimaryAgentOutboxItem(input: {
  missionId: string;
  itemId?: string;
  createdAt?: string;
  payload: PrimaryAgentOutboxPayload;
}): PrimaryAgentOutboxItem {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const item: PrimaryAgentOutboxItem = {
    id: input.itemId ?? randomUUID(),
    missionId: input.missionId,
    createdAt,
    updatedAt: createdAt,
    status: "pending",
    payload: input.payload,
  };

  writeItem(item);
  return item;
}

export function listPrimaryAgentOutboxItems(missionId: string): PrimaryAgentOutboxItem[] {
  return OUTBOX_STATUSES.flatMap((status) => readItemsForStatus(missionId, status)).sort(compareItems);
}

export function leasePrimaryAgentOutboxItem(input: {
  missionId: string;
  leaseOwner: string;
  leasedAt?: string;
  staleAfterMs: number;
}): PrimaryAgentOutboxItem | null {
  const leasedAt = input.leasedAt ?? new Date().toISOString();
  const pending = readItemsForStatus(input.missionId, "pending");
  const staleLeased = readItemsForStatus(input.missionId, "leased").filter((item) =>
    isStaleLease(item, leasedAt),
  );
  const candidate = [...pending, ...staleLeased].sort(compareItems)[0] ?? null;

  if (!candidate) {
    return null;
  }

  const nextItem: PrimaryAgentOutboxItem = {
    ...candidate,
    status: "leased",
    updatedAt: leasedAt,
    lease: {
      attempt: (candidate.lease?.attempt ?? 0) + 1,
      leasedAt,
      owner: input.leaseOwner,
      staleAfterMs: input.staleAfterMs,
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

  writeItem(nextItem, candidate.status);
  return nextItem;
}

export function markPrimaryAgentOutboxItemSubmitted(input: {
  missionId: string;
  itemId: string;
  submittedAt?: string;
  submittedBy: string;
  dispatcherPid?: number;
}): PrimaryAgentOutboxItem {
  const record = findItem(input.missionId, input.itemId);
  if (!record) {
    throw new Error(`Primary-agent outbox item not found: ${input.itemId}`);
  }

  const submittedAt = input.submittedAt ?? new Date().toISOString();
  const item: PrimaryAgentOutboxItem = {
    ...record.item,
    status: "submitted",
    updatedAt: submittedAt,
    submission: {
      submittedAt,
      submittedBy: input.submittedBy,
      ...(typeof input.dispatcherPid === "number" ? { dispatcherPid: input.dispatcherPid } : {}),
    },
  };

  writeItem(item, record.status);
  return item;
}
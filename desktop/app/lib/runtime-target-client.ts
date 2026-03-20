export type RuntimeTargetTransportMode =
  | "direct_session"
  | "inbox_fallback"
  | "unsupported";

export type RuntimeTargetSwitchStatus =
  | "failed"
  | "idle"
  | "inbox_fallback"
  | "ready"
  | "resume_required"
  | "switching"
  | "unset"
  | "unsupported";

export interface RuntimeTargetSnapshot {
  checkedAt: string | null;
  confirmedAt: string | null;
  directSessionSupported?: boolean;
  inboxFallbackAvailable?: boolean;
  lastError: string | null;
  selectedSessionId: string | null;
  selectedThreadId: string | null;
  switchStatus: RuntimeTargetSwitchStatus;
  transportMode: RuntimeTargetTransportMode;
  updatedAt: string | null;
}

export interface RuntimeTargetCandidate {
  bindingState?: string | null;
  isActive?: boolean;
  latestSessionId?: string | null;
  sessionId?: string | null;
  threadId?: string | null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeTransportMode(value: unknown): RuntimeTargetTransportMode {
  switch (value) {
    case "direct_session":
    case "inbox_fallback":
    case "unsupported":
      return value;
    default:
      return "unsupported";
  }
}

function normalizeSwitchStatus(value: unknown): RuntimeTargetSwitchStatus {
  switch (value) {
    case "failed":
    case "idle":
    case "inbox_fallback":
    case "ready":
    case "resume_required":
    case "switching":
    case "unset":
    case "unsupported":
      return value;
    default:
      return "idle";
  }
}

export function normalizeRuntimeTargetSnapshot(
  value: unknown
): RuntimeTargetSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    checkedAt: asString(record.checkedAt),
    confirmedAt: asString(record.confirmedAt),
    directSessionSupported:
      typeof record.directSessionSupported === "boolean"
        ? record.directSessionSupported
        : undefined,
    inboxFallbackAvailable:
      typeof record.inboxFallbackAvailable === "boolean"
        ? record.inboxFallbackAvailable
        : undefined,
    lastError: asString(record.lastError),
    selectedSessionId: asString(record.selectedSessionId),
    selectedThreadId: asString(record.selectedThreadId),
    switchStatus: normalizeSwitchStatus(record.switchStatus),
    transportMode: normalizeTransportMode(record.transportMode),
    updatedAt: asString(record.updatedAt),
  };
}

export function isRuntimeTargetReady(
  runtimeTarget: RuntimeTargetSnapshot | null | undefined
): boolean {
  return Boolean(
    runtimeTarget?.selectedSessionId &&
      runtimeTarget.transportMode === "direct_session" &&
      runtimeTarget.switchStatus === "ready"
  );
}

export function isRuntimeTargetFallbackEligible(
  runtimeTarget: RuntimeTargetSnapshot | null | undefined
): boolean {
  return Boolean(
    runtimeTarget?.selectedThreadId &&
      runtimeTarget.selectedSessionId &&
      (runtimeTarget.transportMode === "inbox_fallback" ||
        runtimeTarget.transportMode === "unsupported" ||
        runtimeTarget.switchStatus === "inbox_fallback" ||
        runtimeTarget.switchStatus === "unsupported")
  );
}

export function isRuntimeTargetResumeRequired(
  runtimeTarget: RuntimeTargetSnapshot | null | undefined
): boolean {
  return runtimeTarget?.switchStatus === "resume_required";
}

function getCandidateSessionId(
  candidate: RuntimeTargetCandidate | null | undefined
): string | null {
  return asString(candidate?.latestSessionId) ?? asString(candidate?.sessionId);
}

function isLiveRuntimeCandidate(
  candidate: RuntimeTargetCandidate | null | undefined
): boolean {
  const bindingState = asString(candidate?.bindingState);
  return Boolean(
    asString(candidate?.threadId) &&
      getCandidateSessionId(candidate) &&
      (candidate?.isActive === true ||
        bindingState === "active" ||
        bindingState === "restored")
  );
}

export function resolveRuntimeTargetSnapshot(
  runtimeTarget: RuntimeTargetSnapshot | null | undefined,
  candidates: readonly RuntimeTargetCandidate[],
  preferredThreadId?: string | null
): RuntimeTargetSnapshot | null {
  if (
    isRuntimeTargetReady(runtimeTarget) ||
    isRuntimeTargetFallbackEligible(runtimeTarget) ||
    isRuntimeTargetResumeRequired(runtimeTarget)
  ) {
    return runtimeTarget ?? null;
  }

  const normalizedPreferredThreadId = asString(preferredThreadId);
  const preferredCandidate = normalizedPreferredThreadId
    ? candidates.find(
        (candidate) =>
          asString(candidate.threadId) === normalizedPreferredThreadId &&
          isLiveRuntimeCandidate(candidate)
      )
    : null;
  const fallbackCandidate =
    preferredCandidate ?? candidates.find(isLiveRuntimeCandidate) ?? null;

  if (!fallbackCandidate) {
    return runtimeTarget ?? null;
  }

  const selectedThreadId = asString(fallbackCandidate.threadId);
  const selectedSessionId = getCandidateSessionId(fallbackCandidate);
  if (selectedThreadId === null || selectedSessionId === null) {
    return runtimeTarget ?? null;
  }

  const transportMode: RuntimeTargetTransportMode =
    runtimeTarget?.directSessionSupported === true
      ? "direct_session"
      : runtimeTarget?.transportMode === "unsupported" ||
          runtimeTarget?.inboxFallbackAvailable === false
        ? "unsupported"
        : runtimeTarget?.transportMode === "inbox_fallback"
          ? "inbox_fallback"
          : "inbox_fallback";

  return {
    checkedAt: runtimeTarget?.checkedAt ?? null,
    confirmedAt: runtimeTarget?.confirmedAt ?? runtimeTarget?.updatedAt ?? null,
    directSessionSupported: runtimeTarget?.directSessionSupported,
    inboxFallbackAvailable: runtimeTarget?.inboxFallbackAvailable,
    lastError: runtimeTarget?.lastError ?? null,
    selectedSessionId,
    selectedThreadId,
    switchStatus:
      transportMode === "direct_session"
        ? "ready"
        : transportMode === "unsupported"
          ? "unsupported"
          : "inbox_fallback",
    transportMode,
    updatedAt: runtimeTarget?.updatedAt ?? null,
  };
}

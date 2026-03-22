export type SessionStatus = "idle" | "busy" | "retry";

export function coerceSessionStatus(value: unknown): SessionStatus | null {
  if (value === "idle" || value === "busy" || value === "retry") {
    return value;
  }

  if (value && typeof value === "object") {
    const type = (value as { type?: unknown }).type;
    if (type === "idle" || type === "busy" || type === "retry") {
      return type;
    }
  }

  return null;
}

export function isSessionStatusActive(status: SessionStatus | null | undefined): boolean {
  return status === "busy" || status === "retry";
}

export function getSessionStatusForId(
  statuses: Record<string, unknown> | null | undefined,
  sessionId: string | null | undefined
): SessionStatus | null {
  if (!statuses || !sessionId) {
    return null;
  }

  return coerceSessionStatus(statuses[sessionId]);
}

export async function fetchSessionStatuses(): Promise<Record<string, SessionStatus>> {
  const response = await fetch("/api/session-status");
  if (!response.ok) {
    throw new Error(`session status failed: ${response.status}`);
  }

  const data = (await response.json()) as { statuses?: Record<string, unknown> };
  const statuses: Record<string, SessionStatus> = {};

  for (const [sessionId, value] of Object.entries(data.statuses ?? {})) {
    const status = coerceSessionStatus(value);
    if (status) {
      statuses[sessionId] = status;
    }
  }

  return statuses;
}

export async function fetchSessionStatus(sessionId: string): Promise<SessionStatus | null> {
  const statuses = await fetchSessionStatuses();
  return getSessionStatusForId(statuses, sessionId);
}
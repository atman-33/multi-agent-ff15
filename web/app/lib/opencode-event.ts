import type { Event } from "@opencode-ai/sdk";

type EventEnvelope = {
  payload?: unknown;
};

export function unwrapOpencodeEvent(input: unknown): Event | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  if (typeof candidate.type === "string") {
    return input as Event;
  }

  const wrapped = (input as EventEnvelope).payload;
  if (!wrapped || typeof wrapped !== "object") {
    return null;
  }

  return typeof (wrapped as Record<string, unknown>).type === "string"
    ? (wrapped as Event)
    : null;
}
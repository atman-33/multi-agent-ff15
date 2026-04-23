import { describe, expect, it } from "vitest";
import { coerceSessionStatus, isSessionStatusActive } from "./session-status";

describe("session-status", () => {
  it("treats retry as an active session state", () => {
    expect(isSessionStatusActive("retry")).toBe(true);
    expect(isSessionStatusActive("busy")).toBe(true);
    expect(isSessionStatusActive("idle")).toBe(false);
    expect(isSessionStatusActive(null)).toBe(false);
  });

  it("coerces nested session status payloads", () => {
    expect(coerceSessionStatus({ type: "retry" })).toBe("retry");
    expect(coerceSessionStatus({ type: "busy" })).toBe("busy");
    expect(coerceSessionStatus({ type: "idle" })).toBe("idle");
    expect(coerceSessionStatus({ type: "unknown" })).toBeNull();
  });
});
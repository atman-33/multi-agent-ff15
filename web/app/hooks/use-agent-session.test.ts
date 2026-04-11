import { describe, expect, it, vi } from "vitest";
import { withMissionStartPending } from "./use-agent-session";

describe("withMissionStartPending", () => {
  it("clears pending after a successful mission start", async () => {
    const setPending = vi.fn();

    const result = await withMissionStartPending(setPending, async () => "mission-1");

    expect(result).toBe("mission-1");
    expect(setPending.mock.calls).toEqual([[true], [false]]);
  });

  it("clears pending after a failed mission start", async () => {
    const setPending = vi.fn();

    await expect(
      withMissionStartPending(setPending, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(setPending.mock.calls).toEqual([[true], [false]]);
  });
});
import { describe, expect, it, vi } from "vitest";
import {
  handleMissingMissionRoute,
  loadMissionExistence,
} from "@/lib/mission-route-availability";

describe("noctis-team mission route", () => {
  it("does not redirect when the mission exists", () => {
    const navigateMock = vi.fn();
    const notifyMock = vi.fn();

    expect(
      handleMissingMissionRoute({
        fallbackPath: "/noctis-team",
        loaderData: { exists: true, requestedMissionId: "mission-123" },
        navigate: navigateMock,
        notify: notifyMock,
      }),
    ).toBe(false);

    expect(navigateMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("redirects back to the surface root when the mission is missing", () => {
    const navigateMock = vi.fn();
    const notifyMock = vi.fn();

    expect(
      handleMissingMissionRoute({
        fallbackPath: "/noctis-team",
        loaderData: { exists: false, requestedMissionId: "mission-123" },
        navigate: navigateMock,
        notify: notifyMock,
      }),
    ).toBe(true);

    expect(notifyMock).toHaveBeenCalledWith("Mission not found", {
      description: "Mission mission-123 could not be restored.",
    });
    expect(navigateMock).toHaveBeenCalledWith("/noctis-team", { replace: true });
  });

  it("checks the surface-specific mission endpoint in the loader helper", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });

    const result = await loadMissionExistence({
      endpointPath: "/api/noctis/missions",
      fetchImpl: fetchMock as typeof fetch,
      request: new Request("http://localhost/noctis-team/mission-123"),
      requestedMissionId: "mission-123",
    });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost/api/noctis/missions/mission-123");
    expect(result).toEqual({ exists: true, requestedMissionId: "mission-123" });
  });
});
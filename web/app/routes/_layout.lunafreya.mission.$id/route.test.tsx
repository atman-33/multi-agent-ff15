import { describe, expect, it, vi } from "vitest";
import {
  handleMissingMissionRoute,
  loadMissionExistence,
} from "@/lib/mission-route-availability";

describe("lunafreya mission route", () => {
  it("does not redirect when the mission exists", () => {
    const navigateMock = vi.fn();
    const notifyMock = vi.fn();

    expect(
      handleMissingMissionRoute({
        fallbackPath: "/lunafreya",
        loaderData: { exists: true, requestedMissionId: "mission-luna" },
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
        fallbackPath: "/lunafreya",
        loaderData: { exists: false, requestedMissionId: "mission-luna" },
        navigate: navigateMock,
        notify: notifyMock,
      }),
    ).toBe(true);

    expect(notifyMock).toHaveBeenCalledWith("Mission not found", {
      description: "Mission mission-luna could not be restored.",
    });
    expect(navigateMock).toHaveBeenCalledWith("/lunafreya", { replace: true });
  });

  it("checks the surface-specific mission endpoint in the loader helper", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });

    const result = await loadMissionExistence({
      endpointPath: "/api/lunafreya/missions",
      fetchImpl: fetchMock as typeof fetch,
      request: new Request("http://localhost/lunafreya/mission-luna"),
      requestedMissionId: "mission-luna",
    });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost/api/lunafreya/missions/mission-luna");
    expect(result).toEqual({ exists: true, requestedMissionId: "mission-luna" });
  });
});
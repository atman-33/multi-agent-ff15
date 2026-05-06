import { describe, expect, it, vi } from "vitest";

import {
  formatResumeActiveWorkerStepSuccessMessage,
  resumeActiveWorkerStep,
} from "./resume-active-worker-step";

describe("resumeActiveWorkerStep", () => {
  it("posts the selected worker to the mission resume route and returns the payload", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          agentId: "gladiolus",
          stepName: "implement",
          taskId: "task-1",
          sessionId: "worker-session",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      resumeActiveWorkerStep({
        missionId: "mission-123",
        agentId: "gladiolus",
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toMatchObject({
      agentId: "gladiolus",
      stepName: "implement",
      taskId: "task-1",
      sessionId: "worker-session",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/missions/mission-123/resume-active-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: "gladiolus" }),
    });
  });

  it("throws the route error message when the resume request fails", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Active step changed" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      resumeActiveWorkerStep({
        missionId: "mission-123",
        agentId: "gladiolus",
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).rejects.toThrow("Active step changed");
  });
});

describe("formatResumeActiveWorkerStepSuccessMessage", () => {
  it("formats a compact success toast message", () => {
    expect(
      formatResumeActiveWorkerStepSuccessMessage({
        agentId: "gladiolus",
        stepName: "implement",
        taskId: "task-1",
        sessionId: "worker-session",
      }),
    ).toBe("Resumed Gladiolus for implement.");
  });
});
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  appendOpencodeSdkLabDebugLogMock,
  composeUserToNoctisPromptMock,
  createMissionMock,
  deleteMissionMock,
  getMissionDirMock,
  getMissionMock,
  getProjectRootMock,
  resolveMissionExecutionRootMock,
  saveOperationStateMock,
  setAgentModelsMock,
  setAllowedWorkersMock,
} = vi.hoisted(() => ({
  appendOpencodeSdkLabDebugLogMock: vi.fn(),
  composeUserToNoctisPromptMock: vi.fn(),
  createMissionMock: vi.fn(),
  deleteMissionMock: vi.fn(),
  getMissionDirMock: vi.fn(),
  getMissionMock: vi.fn(),
  getProjectRootMock: vi.fn(),
  resolveMissionExecutionRootMock: vi.fn(),
  saveOperationStateMock: vi.fn(),
  setAgentModelsMock: vi.fn(),
  setAllowedWorkersMock: vi.fn(),
}));

vi.mock("@/lib/get-project-root.server", () => ({
  getProjectRoot: getProjectRootMock,
}));

vi.mock("@/lib/mission-execution-workspace.server", () => ({
  resolveMissionExecutionRoot: resolveMissionExecutionRootMock,
}));

vi.mock("@/lib/mission-store", () => ({
  createMission: createMissionMock,
  deleteMission: deleteMissionMock,
  getMission: getMissionMock,
  getMissionDir: getMissionDirMock,
  setAgentModels: setAgentModelsMock,
  setAllowedWorkers: setAllowedWorkersMock,
}));

vi.mock("@/lib/operation-runtime/state", () => ({
  saveOperationState: saveOperationStateMock,
}));

vi.mock("@/lib/opencode-sdk-lab.server", () => ({
  appendOpencodeSdkLabDebugLog: appendOpencodeSdkLabDebugLogMock,
}));

vi.mock("@/lib/prompt-composition-engine", () => ({
  composeUserToNoctisPrompt: composeUserToNoctisPromptMock,
}));

import { action } from "./api.opencode-sdk-lab.noctis-mission-payload";

afterEach(() => {
  appendOpencodeSdkLabDebugLogMock.mockReset();
  composeUserToNoctisPromptMock.mockReset();
  createMissionMock.mockReset();
  deleteMissionMock.mockReset();
  getMissionDirMock.mockReset();
  getMissionMock.mockReset();
  getProjectRootMock.mockReset();
  resolveMissionExecutionRootMock.mockReset();
  saveOperationStateMock.mockReset();
  setAgentModelsMock.mockReset();
  setAllowedWorkersMock.mockReset();
});

describe("api.opencode-sdk-lab.noctis-mission-payload", () => {
  it("composes a replayable Noctis mission payload without mutating the original mission", async () => {
    getProjectRootMock.mockReturnValue("/app");
    getMissionDirMock.mockReturnValue("/app/runtime/noctis-missions/temp");
    getMissionMock.mockReturnValue({
      id: "mission-1",
      title: "Shiritori",
      objective: "Continue the mission",
      surfaceId: "noctis_team",
      primaryAgentId: "noctis",
      executionProjectId: "srms",
      executionTargetMode: "execution_project",
      contextProjectIds: [],
      allowedWorkers: ["ignis", "prompto"],
      primarySessionId: "session-original",
      noctisSessionId: "session-original",
      agentModels: {
        noctis: {
          modelID: "gpt-5-mini",
          providerID: "github-copilot",
          variant: "high",
        },
      },
      operationState: {
        operationName: "shiritori-smoke-test",
        operationRef: "builtin:ja:shiritori-smoke-test.yaml",
        currentStep: "start",
        iteration: 1,
        status: "waiting_for_report",
        activatedAt: "2026-04-22T00:00:00.000Z",
        updatedAt: "2026-04-22T00:00:00.000Z",
        reportDir: "docs/reports",
        stepHistory: [],
        delegatedTasks: [],
        deviations: { totalDeviations: 0, history: [] },
      },
      lunafreyaFacetSelection: undefined,
      baseBranch: undefined,
      branch: undefined,
      workspacePath: undefined,
      workspaceStatus: undefined,
    });
    resolveMissionExecutionRootMock.mockReturnValue({
      executionRoot: "/projects/srms",
      executionTargetMode: "execution_project",
      executionProject: { id: "srms", rootPath: "/projects/srms" },
      recreated: false,
      sessionHostRoot: "/app",
    });
    composeUserToNoctisPromptMock.mockReturnValue({
      effectivePrompt: "Prompt mission-1 text",
      operationActivated: "shiritori-smoke-test",
      payloadParts: [{ type: "text", text: "Prompt mission-1 text" }],
      promptBody: "Prompt mission-1 text",
      sharedContext: "shared context",
      stateTransition: null,
      suppressedContext: null,
      workflowExtension: "workflow",
    });

    const response = await action({
      request: new Request("http://localhost/api/opencode-sdk-lab/noctis-mission-payload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "continue",
          missionId: "mission-1",
          sessionId: "session-preview",
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(createMissionMock).toHaveBeenCalledWith(
      expect.stringMatching(/^opencode-sdk-lab-preview-/),
      "session-preview",
      expect.objectContaining({
        allowedWorkers: ["ignis", "prompto"],
        executionProjectId: "srms",
        executionTargetMode: "execution_project",
        objective: "Continue the mission",
        title: "Shiritori",
      }),
    );
    expect(saveOperationStateMock).toHaveBeenCalledWith(
      expect.stringMatching(/^opencode-sdk-lab-preview-/),
      expect.objectContaining({
        currentStep: "start",
        operationName: "shiritori-smoke-test",
      }),
    );
    expect(composeUserToNoctisPromptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          allowedWorkers: ["ignis", "prompto"],
          appRoot: "/app",
          executionMode: "orchestrated",
          missionId: "mission-1",
          sessionId: "session-preview",
        }),
        isNewMission: false,
        missionId: expect.stringMatching(/^opencode-sdk-lab-preview-/),
        sessionId: "session-preview",
        userMessage: "continue",
      }),
    );
    expect(deleteMissionMock).toHaveBeenCalledWith(expect.stringMatching(/^opencode-sdk-lab-preview-/));

    await expect(response.json()).resolves.toEqual({
      action: "noctis-mission-payload",
      agent: "noctis",
      allowedWorkers: ["ignis", "prompto"],
      effectivePrompt: "Prompt mission-1 text",
      executionMode: "orchestrated",
      executionRoot: "/projects/srms",
      missionId: "mission-1",
      modelRef: "github-copilot/gpt-5-mini",
      operationActivated: "shiritori-smoke-test",
      payloadParts: [{ type: "text", text: "Prompt mission-1 text" }],
      payloadText: "Prompt mission-1 text",
      promptBody: "Prompt mission-1 text",
      sessionId: "session-preview",
      sharedContext: "shared context",
      stateTransition: null,
      suppressedContext: null,
      userMessage: "continue",
      variant: "high",
      workflowExtension: "workflow",
    });
  });
});
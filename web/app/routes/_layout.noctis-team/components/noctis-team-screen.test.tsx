import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MissionResumePayload } from "@/hooks/use-agent-session";
import { createOperationState } from "@/lib/operation-runtime/state";

const {
  projectRegistryStateMock,
  agentSessionStateMock,
  lunafreyaStatusPropsSpy,
  matchMock,
  navigateMock,
  paramsMock,
  partyStatusPropsSpy,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  projectRegistryStateMock: vi.fn(),
  agentSessionStateMock: vi.fn(),
  lunafreyaStatusPropsSpy: vi.fn(),
  matchMock: vi.fn(),
  navigateMock: vi.fn(),
  paramsMock: vi.fn(),
  partyStatusPropsSpy: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("react-router", () => ({
  NavLink: ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useMatch: () => matchMock(),
  useNavigate: () => navigateMock,
  useParams: () => paramsMock(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock("@/hooks/use-agent-session", () => ({
  useAgentSession: () => agentSessionStateMock(),
}));

vi.mock("@/hooks/use-project-registry", () => ({
  useProjectRegistry: () => projectRegistryStateMock(),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children?: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/workspace-launch-actions", () => ({
  WorkspaceLaunchActions: ({
    path,
    vscodePreference,
  }: {
    path: string;
    vscodePreference: string;
  }) => <div>{`workspace-launch-actions:${path}:${vscodePreference}`}</div>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children?: ReactNode; open?: boolean }) => <div>{children}</div>,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/resizable", () => ({
  ResizablePanel: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ResizablePanelGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: Record<string, unknown>) => <textarea {...props} />,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children?: ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock("./banter-log", () => ({
  BanterLog: () => <div>banter-log</div>,
}));

vi.mock("./chat-area", () => ({
  ChatArea: ({
    composerDraftKey,
    showExecutionProjectSelector,
    selectedExecutionProjectId,
    executionProjectLaunchPath,
    executionProjectVSCodePreference,
    selectedExecutionTargetMode,
    executionProjectHint,
    executionProjectOptions,
    contextProjects,
    contextActionLabel,
    missionExecutionLabel,
    missionActionLabel,
    isStartingMission,
    showAbortAction,
    historyErrorMessage,
    historyPhase,
    abortSettlementPhase,
    streamingContent,
    workflowProgress,
    showWorkflowSelector,
    primaryAgentId,
    headerTitle,
    composerStatusLabel,
    failedDeliveryNotice,
  }: {
    composerDraftKey?: string | null;
    showExecutionProjectSelector?: boolean;
    selectedExecutionProjectId?: string | null;
    executionProjectLaunchPath?: string | null;
    executionProjectVSCodePreference?: string | null;
    selectedExecutionTargetMode?: string | null;
    executionProjectHint?: string | null;
    executionProjectOptions?: Array<{ value: string; label: string }>;
    contextProjects?: Array<{ id: string; label: string }>;
    contextActionLabel?: string | null;
    missionExecutionLabel?: string | null;
    missionActionLabel?: string | null;
    isStartingMission?: boolean;
    showAbortAction?: boolean;
    historyErrorMessage?: string | null;
    historyPhase?: string | null;
    abortSettlementPhase?: string | null;
    streamingContent?: string;
    showWorkflowSelector?: boolean;
    primaryAgentId?: string | null;
    headerTitle?: string | null;
    composerStatusLabel?: string | null;
    failedDeliveryNotice?: {
      itemId: string;
      isResending: boolean;
      reason: string;
    } | null;
    workflowProgress?: {
      currentStepIndex: number;
      totalSteps: number;
      status: string;
      currentStep: string;
    } | null;
  }) => (
    <div>
      <div>chat-area</div>
      <div>{`composer-draft-key:${composerDraftKey ?? "none"}`}</div>
      <div>{`mission-start:${isStartingMission ? "yes" : "no"}`}</div>
      <div>{`abort-action:${showAbortAction ? "yes" : "no"}`}</div>
      <div>{`history-phase:${historyPhase ?? "none"}`}</div>
      <div>{`abort-settlement:${abortSettlementPhase ?? "idle"}`}</div>
      <div>{`streaming-content:${streamingContent ?? "none"}`}</div>
      {historyErrorMessage ? <div>{`history-error:${historyErrorMessage}`}</div> : null}
      <div>{`workflow-selector:${showWorkflowSelector === false ? "no" : "yes"}`}</div>
      <div>{`primary-agent:${primaryAgentId ?? "none"}`}</div>
      {headerTitle ? <div>{`header:${headerTitle}`}</div> : null}
      {composerStatusLabel ? <div>{`composer-status:${composerStatusLabel}`}</div> : null}
      {failedDeliveryNotice ? (
        <div>
          {`failed-delivery:${failedDeliveryNotice.itemId}:${failedDeliveryNotice.reason}:${failedDeliveryNotice.isResending ? "resending" : "idle"}`}
        </div>
      ) : null}
      {workflowProgress ? (
        <div>{`workflow-progress:${workflowProgress.currentStepIndex}/${workflowProgress.totalSteps}:${workflowProgress.status}:${workflowProgress.currentStep}`}</div>
      ) : null}
      {showExecutionProjectSelector ? (
        <div>{`execution-selector:${selectedExecutionProjectId ?? "none"}`}</div>
      ) : null}
      {executionProjectLaunchPath ? (
        <div>{`execution-launch:${executionProjectLaunchPath}:${executionProjectVSCodePreference ?? "auto"}`}</div>
      ) : null}
      {showExecutionProjectSelector ? (
        <div>{`execution-mode:${selectedExecutionTargetMode ?? "none"}`}</div>
      ) : null}
      {executionProjectOptions?.length ? (
        <div>{`execution-options:${executionProjectOptions.map((project) => project.label).join(",")}`}</div>
      ) : null}
      {executionProjectHint ? <div>{executionProjectHint}</div> : null}
      {contextProjects ? (
        <div>{`context:${contextProjects.length > 0 ? contextProjects.map((project) => project.label).join("|") : "None"}`}</div>
      ) : null}
      {contextActionLabel ? <div>{`context-action:${contextActionLabel}`}</div> : null}
      {missionExecutionLabel ? <div>{`started-execution:${missionExecutionLabel}`}</div> : null}
      {missionActionLabel ? <div>{`mission-action:${missionActionLabel}`}</div> : null}
    </div>
  ),
}));

vi.mock("./mission-output-browser", () => ({
  MissionOutputBrowser: () => <div>mission-output-browser</div>,
  getMissionOutputKey: ({ step, taskId, filename }: { step: string; taskId: string; filename: string }) =>
    `${step}:${taskId}:${filename}`,
}));

vi.mock("./party-status-panel", () => ({
  PartyStatusPanel: (props: Record<string, unknown>) => {
    partyStatusPropsSpy(props);
    return <div>party-status-panel</div>;
  },
}));

vi.mock("./lunafreya-status-panel", () => ({
  LunafreyaStatusPanel: (props: {
    selectedJobId?: string | null;
    selectedSkillIds?: string[];
    onToggleSkillId?: (skillId: string) => void;
    onClearSkillIds?: () => void;
  }) => {
    lunafreyaStatusPropsSpy(props);

    return (
      <div>{`lunafreya-status:${props.selectedJobId ?? "none"}:${props.selectedSkillIds?.join("|") || "none"}`}</div>
    );
  },
}));

vi.mock("./mission-activity-log", () => ({
  MissionActivityLog: ({ entries }: { entries?: Array<unknown> }) => (
    <div>{`activity-log:${entries?.length ?? 0}`}</div>
  ),
}));

import { NoctisTeamScreen } from "./noctis-team-screen";

const buildMission = (overrides: Partial<MissionResumePayload> = {}): MissionResumePayload => ({
  missionId: "mission-1",
  title: "Mission One",
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  status: "active",
  executionProjectId: "core-repo",
  executionTargetMode: "mission_workspace",
  contextProjectIds: ["docs-repo"],
  baseBranch: "main",
  branch: "mission/20260401-mission-one",
  workspacePath: "/tmp/worktrees/core-repo/mission-one",
  workspaceStatus: "ready",
  resumeBlockedReason: null,
  sessions: {
    primary: "session-1",
    noctis: "session-1",
    ignis: null,
    gladiolus: null,
    prompto: null,
  },
  operationState: null,
  ...overrides,
});

describe("noctis-team-screen", () => {
  beforeEach(() => {
    paramsMock.mockReturnValue({});
    matchMock.mockReturnValue(null);
    lunafreyaStatusPropsSpy.mockReset();
    partyStatusPropsSpy.mockReset();
    navigateMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    projectRegistryStateMock.mockReturnValue({
      data: {
        projects: [
          {
            id: "core-repo",
            displayName: "Core Repo",
            path: "/repos/core",
          },
          {
            id: "docs-repo",
            displayName: "Reference Docs",
            path: "/repos/docs",
          },
        ],
      },
      error: null,
      loading: false,
    });
    agentSessionStateMock.mockReturnValue({
      messages: [],
      streamingContent: "",
      banterEntries: [],
      latestBanterEntryId: null,
      partyMembers: [],
      speakingAgentId: null,
      historyErrorMessage: null,
      historyPhase: "idle",
      abortSettlementPhase: "idle",
      isStartingMission: false,
      isSessionActive: false,
      isStreaming: false,
      isLoadingHistory: false,
      availableOperations: [],
      selectedOperation: null,
      activeOperationState: null,
      workflowProgress: null,
      activityLog: [],
      primaryContextUsage: null,
      isOperationSelectionLocked: false,
      setSelectedOperation: vi.fn(),
      send: vi.fn(),
      abort: vi.fn(),
    });
  });

  it("shows execution project selection with an empty new-mission context hint", () => {
    const markup = renderToStaticMarkup(
      <NoctisTeamScreen activeMissionId={null} initialMissionData={null} language="other" />,
    );

    expect(markup).toContain("composer-draft-key:mission-surface:noctis_team:new");
    expect(markup).toContain("execution-selector:core-repo");
    expect(markup).toContain("execution-launch:/repos/core:auto");
    expect(markup).toContain("execution-mode:execution_project");
    expect(markup).toContain("execution-options:Core Repo,Reference Docs");
    expect(markup).toContain("Context projects start empty for new missions.");
    expect(markup).toContain("context:None");
    expect(markup).toContain("context-action:Mission Context");
    expect(markup).not.toContain("Mission Setup");
  });

  it("renders execution project launch actions in the new-mission context dialog", () => {
    const markup = renderToStaticMarkup(
      <NoctisTeamScreen activeMissionId={null} initialMissionData={null} language="other" />,
    );

    expect(markup).toContain("workspace-launch-actions:/repos/core:auto");
  });

  it("passes temporary mission streaming content through to the chat area", () => {
    agentSessionStateMock.mockReturnValue({
      ...agentSessionStateMock(),
      historyPhase: "loading",
      isLoadingHistory: true,
      isStreaming: true,
      streamingContent: "Mission two is responding",
    });

    const markup = renderToStaticMarkup(
      <NoctisTeamScreen
        activeMissionId="mission-1"
        initialMissionData={buildMission()}
        language="other"
      />,
    );

    expect(markup).toContain("composer-draft-key:mission-surface:noctis_team:mission:mission-1");
    expect(markup).toContain("streaming-content:Mission two is responding");
  });

  it("shows a legacy mission resume block until an execution project is assigned", () => {
    paramsMock.mockReturnValue({ id: "mission-1" });

    const markup = renderToStaticMarkup(
      <NoctisTeamScreen
        activeMissionId="mission-1"
        initialMissionData={buildMission({
          executionProjectId: null,
          workspacePath: null,
          workspaceStatus: null,
          resumeBlockedCode: "missing_execution_project",
          resumeBlockedReason:
            "Assign an execution project before resuming this legacy mission.",
          sessions: {
            noctis: null,
            ignis: null,
            gladiolus: null,
            prompto: null,
          },
        })}
        language="other"
      />,
    );

    expect(markup).toContain("cannot resume until an execution project is assigned");
    expect(markup).toContain("Assign Execution Project");
  });

  it("passes mission resume context into the party status panel", () => {
    const activeOperationState = createOperationState(
      "review-cycle-test",
      "implement",
      "builtin:ja:review-cycle-test.yaml",
    );
    activeOperationState.currentStep = "implement";
    activeOperationState.status = "waiting_for_report";
    activeOperationState.stepHistory = [
      {
        step: "implement",
        agent: "gladiolus",
        taskId: "task-1",
        status: "dispatched",
        dispatchedAt: "2026-05-01T00:00:00.000Z",
      },
    ];

    agentSessionStateMock.mockReturnValue({
      ...agentSessionStateMock(),
      activeOperationState,
    });

    renderToStaticMarkup(
      <NoctisTeamScreen
        activeMissionId="mission-1"
        initialMissionData={buildMission()}
        language="other"
      />,
    );

    const props = partyStatusPropsSpy.mock.calls.at(-1)?.[0] as {
      missionId?: string | null;
      activeOperationState?: unknown;
    };

    expect(props.missionId).toBe("mission-1");
    expect(props.activeOperationState).toBe(activeOperationState);
  });

  it("passes only the latest retryable failed delivery into the chat area", () => {
    paramsMock.mockReturnValue({ id: "mission-1" });

    const markup = renderToStaticMarkup(
      <NoctisTeamScreen
        activeMissionId="mission-1"
        initialMissionData={buildMission({
          primaryAgentOutbox: [
            {
              id: "item-old-failed",
              missionId: "mission-1",
              createdAt: "2026-04-28T00:00:00.000Z",
              updatedAt: "2026-04-28T00:00:00.000Z",
              status: "failed",
              payload: {
                agent: "noctis",
                sessionId: "session-1",
              },
              failure: {
                failedAt: "2026-04-28T00:00:00.000Z",
                failedBy: "dispatcher:test",
                reason: "older failure",
              },
            },
            {
              id: "item-superseded-failed",
              missionId: "mission-1",
              createdAt: "2026-04-28T00:10:00.000Z",
              updatedAt: "2026-04-28T00:10:00.000Z",
              status: "failed",
              payload: {
                agent: "noctis",
                sessionId: "session-1",
              },
              failure: {
                failedAt: "2026-04-28T00:10:00.000Z",
                failedBy: "dispatcher:test",
                reason: "superseded failure",
              },
              replay: {
                replayedAt: "2026-04-28T00:11:00.000Z",
                replayedBy: "mission-route",
                supersededByItemId: "item-replay-2",
              },
            },
            {
              id: "item-latest-failed",
              missionId: "mission-1",
              createdAt: "2026-04-28T00:20:00.000Z",
              updatedAt: "2026-04-28T00:21:00.000Z",
              status: "failed",
              payload: {
                agent: "noctis",
                sessionId: "session-1",
              },
              failure: {
                failedAt: "2026-04-28T00:21:00.000Z",
                failedBy: "dispatcher:test",
                reason: "latest failure",
              },
            },
          ],
        })}
        language="other"
      />,
    );

    expect(markup).toContain("failed-delivery:item-latest-failed:latest failure:idle");
    expect(markup).not.toContain("failed-delivery:item-old-failed:older failure:idle");
    expect(markup).not.toContain("item-superseded-failed");
    expect(markup).not.toContain("transport-panel:");
  });

  it("shows an unsupported runtime alert for incompatible missions", () => {
    paramsMock.mockReturnValue({ id: "mission-1" });

    const markup = renderToStaticMarkup(
      <NoctisTeamScreen
        activeMissionId="mission-1"
        initialMissionData={buildMission({
          resumeBlockedCode: "unsupported_mission_runtime",
          resumeBlockedReason: "Mission uses an unsupported runtime format and can no longer be resumed.",
        })}
        language="other"
      />,
    );

    expect(markup).toContain("Mission uses an unsupported runtime format and can no longer be resumed.");
    expect(markup).toContain("mission-action:Mission Details");
    expect(markup).not.toContain("Assign Execution Project");
  });

  it("shows workspace status and delete controls for an execution-backed mission", () => {
    paramsMock.mockReturnValue({ id: "mission-1" });

    const markup = renderToStaticMarkup(
      <NoctisTeamScreen
        activeMissionId="mission-1"
        initialMissionData={buildMission()}
        language="other"
      />,
    );

    expect(markup).toContain("started-execution:Core Repo");
    expect(markup).toContain("context:Reference Docs");
    expect(markup).toContain("mission-action:Mission Details");
    expect(markup).not.toContain("Workspace: Ready");
  });

  it("shows the working branch in mission details for mission workspaces", () => {
    paramsMock.mockReturnValue({ id: "mission-1" });

    const markup = renderToStaticMarkup(
      <NoctisTeamScreen
        activeMissionId="mission-1"
        initialMissionData={buildMission()}
        language="other"
      />,
    );

    expect(markup).toContain("Working branch");
    expect(markup).toContain("mission/20260401-mission-one");
  });

  it("shows the execution project head branch alongside mission workspace details", () => {
    paramsMock.mockReturnValue({ id: "mission-1" });
    projectRegistryStateMock.mockReturnValue({
      data: {
        projects: [
          {
            id: "core-repo",
            displayName: "Core Repo",
            path: "/repos/core",
            branchName: "feature/active-work",
          },
          {
            id: "docs-repo",
            displayName: "Reference Docs",
            path: "/repos/docs",
          },
        ],
      },
      error: null,
      loading: false,
    });

    const markup = renderToStaticMarkup(
      <NoctisTeamScreen
        activeMissionId="mission-1"
        initialMissionData={buildMission()}
        language="other"
      />,
    );

    expect(markup).toContain("Execution project HEAD");
    expect(markup).toContain("feature/active-work");
  });

  it("passes mission-start pending state to chat area and suppresses abort during startup", () => {
    agentSessionStateMock.mockReturnValue({
      messages: [],
      banterEntries: [],
      latestBanterEntryId: null,
      partyMembers: [],
      speakingAgentId: null,
      historyErrorMessage: null,
      historyPhase: "idle",
      isStartingMission: true,
      isSessionActive: true,
      isStreaming: false,
      isLoadingHistory: false,
      availableOperations: [],
      selectedOperation: null,
      activeOperationState: null,
      activityLog: [],
      primaryContextUsage: null,
      isOperationSelectionLocked: false,
      setSelectedOperation: vi.fn(),
      send: vi.fn(),
      abort: vi.fn(),
    });

    const markup = renderToStaticMarkup(
      <NoctisTeamScreen activeMissionId={null} initialMissionData={null} language="other" />,
    );

    expect(markup).toContain("mission-start:yes");
    expect(markup).toContain("abort-action:no");
  });

  it("suppresses abort actions while abort settlement is still pending", () => {
    agentSessionStateMock.mockReturnValue({
      messages: [],
      banterEntries: [],
      latestBanterEntryId: null,
      partyMembers: [],
      speakingAgentId: null,
      historyErrorMessage: null,
      historyPhase: "ready",
      abortSettlementPhase: "settling",
      isStartingMission: false,
      isSessionActive: true,
      isStreaming: false,
      isLoadingHistory: false,
      availableOperations: [],
      selectedOperation: null,
      activeOperationState: null,
      workflowProgress: null,
      activityLog: [],
      primaryContextUsage: null,
      isOperationSelectionLocked: true,
      setSelectedOperation: vi.fn(),
      send: vi.fn(),
      abort: vi.fn(),
    });

    const markup = renderToStaticMarkup(
      <NoctisTeamScreen
        activeMissionId="mission-1"
        initialMissionData={buildMission()}
        language="other"
      />,
    );

    expect(markup).toContain("abort-settlement:settling");
    expect(markup).toContain("abort-action:no");
  });

  it("shows a workspace alert only for non-ready mission states", () => {
    paramsMock.mockReturnValue({ id: "mission-1" });

    const markup = renderToStaticMarkup(
      <NoctisTeamScreen
        activeMissionId="mission-1"
        initialMissionData={buildMission({ workspaceStatus: "deleted" })}
        language="other"
      />,
    );

    expect(markup).toContain("Workspace deleted. Resume will recreate a fresh workspace and sessions.");
    expect(markup).toContain("mission-action:Mission Details");
  });

  it("shows direct execution details without a delete-workspace action", () => {
    paramsMock.mockReturnValue({ id: "mission-1" });

    const markup = renderToStaticMarkup(
      <NoctisTeamScreen
        activeMissionId="mission-1"
        initialMissionData={buildMission({
          executionTargetMode: "execution_project",
          workspacePath: null,
          workspaceStatus: null,
        })}
        language="other"
      />,
    );

    expect(markup).toContain("Execution mode");
    expect(markup).toContain("Registered project");
    expect(markup).toContain("This mission is using the execution project directly without a dedicated workspace.");
    expect(markup).toContain("/repos/core");
  });

  it("shows the execution project branch as the working branch in direct mode", () => {
    paramsMock.mockReturnValue({ id: "mission-1" });
    projectRegistryStateMock.mockReturnValue({
      data: {
        projects: [
          {
            id: "core-repo",
            displayName: "Core Repo",
            path: "/repos/core",
            branchName: "feature/direct-mode",
          },
          {
            id: "docs-repo",
            displayName: "Reference Docs",
            path: "/repos/docs",
          },
        ],
      },
      error: null,
      loading: false,
    });

    const markup = renderToStaticMarkup(
      <NoctisTeamScreen
        activeMissionId="mission-1"
        initialMissionData={buildMission({
          executionTargetMode: "execution_project",
          branch: null,
          baseBranch: null,
          workspacePath: null,
          workspaceStatus: null,
        })}
        language="other"
      />,
    );

    expect(markup).toContain("Working branch");
    expect(markup).toContain("feature/direct-mode");
  });

  it("passes initial workflow progress into the chat area for existing missions", () => {
    paramsMock.mockReturnValue({ id: "mission-1" });

    const markup = renderToStaticMarkup(
      <NoctisTeamScreen
        activeMissionId="mission-1"
        initialMissionData={buildMission({
          workflowProgress: {
            workflowLabel: "test-review-cycle-flow",
            currentStep: "review",
            currentStepIndex: 3,
            totalSteps: 5,
            status: "waiting_for_report",
            updatedAt: "2026-04-11T00:16:00.000Z",
            visitCount: 2,
            isTerminal: false,
          },
        })}
        language="other"
      />,
    );

    expect(markup).toContain("workflow-progress:3/5:waiting_for_report:review");
  });

  it("keeps Noctis shell panels visible while chat history is still loading", () => {
    paramsMock.mockReturnValue({ id: "mission-1" });
    agentSessionStateMock.mockReturnValue({
      messages: [],
      banterEntries: [{ id: "banter-1" }],
      latestBanterEntryId: "banter-1",
      partyMembers: [{ id: "ignis" }],
      speakingAgentId: null,
      historyErrorMessage: null,
      historyPhase: "loading",
      isStartingMission: false,
      isSessionActive: false,
      isStreaming: false,
      isLoadingHistory: true,
      availableOperations: [],
      selectedOperation: null,
      activeOperationState: null,
      workflowProgress: null,
      activityLog: [],
      primaryContextUsage: null,
      isOperationSelectionLocked: true,
      setSelectedOperation: vi.fn(),
      send: vi.fn(),
      abort: vi.fn(),
    });

    const markup = renderToStaticMarkup(
      <NoctisTeamScreen
        activeMissionId="mission-1"
        initialMissionData={buildMission()}
        language="other"
      />,
    );

    expect(markup).toContain("party-status-panel");
    expect(markup).toContain("banter-log");
    expect(markup).toContain("history-phase:loading");
    expect(markup).toContain("mission-output-browser");
  });

  it("renders the Lunafreya surface with banter instead of activity chrome", () => {
    paramsMock.mockReturnValue({ id: "mission-luna" });
    agentSessionStateMock.mockReturnValue({
      messages: [],
      banterEntries: [],
      latestBanterEntryId: null,
      partyMembers: [],
      speakingAgentId: null,
      historyErrorMessage: null,
      historyPhase: "loading",
      isStartingMission: false,
      isSessionActive: false,
      isStreaming: false,
      isLoadingHistory: false,
      availableOperations: [],
      selectedOperation: null,
      activeOperationState: null,
      workflowProgress: null,
      activityLog: [{ id: "activity-1" }],
      primaryContextUsage: null,
      isOperationSelectionLocked: true,
      setSelectedOperation: vi.fn(),
      send: vi.fn(),
      abort: vi.fn(),
    });

    const markup = renderToStaticMarkup(
      <NoctisTeamScreen
        activeMissionId="mission-luna"
        initialMissionData={buildMission({
          missionId: "mission-luna",
          primaryAgentId: "lunafreya",
          primarySessionId: "session-luna",
          surfaceId: "lunafreya",
          lunafreyaFacetSelection: {
            selectedJobId: "oracle",
            selectedSkillIds: ["hydraean"],
            updatedAt: "2026-04-11T00:00:00.000Z",
          },
          sessions: {
            primary: "session-luna",
            noctis: null,
            ignis: null,
            gladiolus: null,
            prompto: null,
          },
        })}
        language="other"
        surfaceId="lunafreya"
      />,
    );

    expect(markup).toContain("workflow-selector:no");
    expect(markup).toContain("history-phase:loading");
    expect(markup).toContain("primary-agent:lunafreya");
    expect(markup).toContain("header:Oracle Mission Surface");
    expect(markup).toContain("composer-draft-key:mission-surface:lunafreya:mission:mission-luna");
    expect(markup).toContain("composer-status:Solo mission surface");
    expect(markup).toContain("lunafreya-status:oracle:hydraean");
    expect(markup).toContain("banter-log");
    expect(markup).not.toContain("activity-log:1");
    expect(markup).not.toContain("party-status-panel");
  });

  it("keeps Lunafreya skill selection state in the mission screen and passes management callbacks", () => {
    paramsMock.mockReturnValue({ id: "mission-luna" });

    renderToStaticMarkup(
      <NoctisTeamScreen
        activeMissionId="mission-luna"
        initialMissionData={buildMission({
          missionId: "mission-luna",
          primaryAgentId: "lunafreya",
          primarySessionId: "session-luna",
          surfaceId: "lunafreya",
          lunafreyaFacetSelection: {
            selectedJobId: "oracle",
            selectedSkillIds: ["hydraean"],
            updatedAt: "2026-04-11T00:00:00.000Z",
          },
          sessions: {
            primary: "session-luna",
            noctis: null,
            ignis: null,
            gladiolus: null,
            prompto: null,
          },
        })}
        language="other"
        surfaceId="lunafreya"
      />,
    );

    const props = lunafreyaStatusPropsSpy.mock.calls.at(-1)?.[0] as {
      selectedJobId: string | null;
      selectedSkillIds: string[];
      onToggleSkillId: (skillId: string) => void;
      onClearSkillIds: () => void;
    };

    expect(props.selectedJobId).toBe("oracle");
    expect(props.selectedSkillIds).toEqual(["hydraean"]);
    expect(typeof props.onToggleSkillId).toBe("function");
    expect(typeof props.onClearSkillIds).toBe("function");
  });
});
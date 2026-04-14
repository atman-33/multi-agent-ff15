import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MissionResumePayload } from "@/hooks/use-agent-session";

const {
  projectRegistryStateMock,
  agentSessionStateMock,
  lunafreyaStatusPropsSpy,
  matchMock,
  navigateMock,
  paramsMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  projectRegistryStateMock: vi.fn(),
  agentSessionStateMock: vi.fn(),
  lunafreyaStatusPropsSpy: vi.fn(),
  matchMock: vi.fn(),
  navigateMock: vi.fn(),
  paramsMock: vi.fn(),
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
    showExecutionProjectSelector,
    selectedExecutionProjectId,
    selectedExecutionTargetMode,
    executionProjectHint,
    executionProjectOptions,
    contextProjects,
    contextActionLabel,
    missionExecutionLabel,
    missionActionLabel,
    isStartingMission,
    showAbortAction,
    workflowProgress,
    showWorkflowSelector,
    primaryAgentId,
    headerTitle,
    composerStatusLabel,
  }: {
    showExecutionProjectSelector?: boolean;
    selectedExecutionProjectId?: string | null;
    selectedExecutionTargetMode?: string | null;
    executionProjectHint?: string | null;
    executionProjectOptions?: Array<{ value: string; label: string }>;
    contextProjects?: Array<{ id: string; label: string }>;
    contextActionLabel?: string | null;
    missionExecutionLabel?: string | null;
    missionActionLabel?: string | null;
    isStartingMission?: boolean;
    showAbortAction?: boolean;
    showWorkflowSelector?: boolean;
    primaryAgentId?: string | null;
    headerTitle?: string | null;
    composerStatusLabel?: string | null;
    workflowProgress?: {
      currentStepIndex: number;
      totalSteps: number;
      status: string;
      currentStep: string;
    } | null;
  }) => (
    <div>
      <div>chat-area</div>
      <div>{`mission-start:${isStartingMission ? "yes" : "no"}`}</div>
      <div>{`abort-action:${showAbortAction ? "yes" : "no"}`}</div>
      <div>{`workflow-selector:${showWorkflowSelector === false ? "no" : "yes"}`}</div>
      <div>{`primary-agent:${primaryAgentId ?? "none"}`}</div>
      {headerTitle ? <div>{`header:${headerTitle}`}</div> : null}
      {composerStatusLabel ? <div>{`composer-status:${composerStatusLabel}`}</div> : null}
      {workflowProgress ? (
        <div>{`workflow-progress:${workflowProgress.currentStepIndex}/${workflowProgress.totalSteps}:${workflowProgress.status}:${workflowProgress.currentStep}`}</div>
      ) : null}
      {showExecutionProjectSelector ? (
        <div>{`execution-selector:${selectedExecutionProjectId ?? "none"}`}</div>
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
  PartyStatusPanel: () => <div>party-status-panel</div>,
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
      banterEntries: [],
      latestBanterEntryId: null,
      partyMembers: [],
      speakingAgentId: null,
      isStartingMission: false,
      isSessionActive: false,
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
  });

  it("shows execution project selection with an empty new-mission context hint", () => {
    const markup = renderToStaticMarkup(
      <NoctisTeamScreen activeMissionId={null} initialMissionData={null} language="other" />,
    );

    expect(markup).toContain("execution-selector:core-repo");
    expect(markup).toContain("execution-mode:execution_project");
    expect(markup).toContain("execution-options:Core Repo,Reference Docs");
    expect(markup).toContain("Context projects start empty for new missions.");
    expect(markup).toContain("context:None");
    expect(markup).toContain("context-action:Mission Context");
    expect(markup).not.toContain("Mission Setup");
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

  it("passes mission-start pending state to chat area and suppresses abort during startup", () => {
    agentSessionStateMock.mockReturnValue({
      messages: [],
      banterEntries: [],
      latestBanterEntryId: null,
      partyMembers: [],
      speakingAgentId: null,
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

  it("passes initial workflow progress into the chat area for existing missions", () => {
    paramsMock.mockReturnValue({ id: "mission-1" });

    const markup = renderToStaticMarkup(
      <NoctisTeamScreen
        activeMissionId="mission-1"
        initialMissionData={buildMission({
          workflowProgress: {
            workflowLabel: "openspec-dev",
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

  it("renders the Lunafreya surface without workflow or party chrome", () => {
    paramsMock.mockReturnValue({ id: "mission-luna" });
    agentSessionStateMock.mockReturnValue({
      messages: [],
      banterEntries: [],
      latestBanterEntryId: null,
      partyMembers: [],
      speakingAgentId: null,
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
    expect(markup).toContain("primary-agent:lunafreya");
    expect(markup).toContain("header:Oracle Mission Surface");
    expect(markup).toContain("composer-status:Solo mission surface");
    expect(markup).toContain("lunafreya-status:oracle:hydraean");
    expect(markup).toContain("activity-log:1");
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
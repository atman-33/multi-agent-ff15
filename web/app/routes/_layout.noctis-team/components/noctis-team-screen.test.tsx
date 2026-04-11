import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MissionResumePayload } from "@/hooks/use-agent-session";

const {
  projectRegistryStateMock,
  agentSessionStateMock,
  matchMock,
  navigateMock,
  paramsMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  projectRegistryStateMock: vi.fn(),
  agentSessionStateMock: vi.fn(),
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
  Dialog: ({ children, open }: { children?: ReactNode; open?: boolean }) =>
    open === false ? null : <div>{children}</div>,
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
    executionProjectHint,
    executionProjectOptions,
    missionContextLabel,
    contextActionLabel,
    missionExecutionLabel,
    missionActionLabel,
  }: {
    showExecutionProjectSelector?: boolean;
    selectedExecutionProjectId?: string | null;
    executionProjectHint?: string | null;
    executionProjectOptions?: Array<{ value: string; label: string }>;
    missionContextLabel?: string | null;
    contextActionLabel?: string | null;
    missionExecutionLabel?: string | null;
    missionActionLabel?: string | null;
  }) => (
    <div>
      <div>chat-area</div>
      {showExecutionProjectSelector ? (
        <div>{`execution-selector:${selectedExecutionProjectId ?? "none"}`}</div>
      ) : null}
      {executionProjectOptions?.length ? (
        <div>{`execution-options:${executionProjectOptions.map((project) => project.label).join(",")}`}</div>
      ) : null}
      {executionProjectHint ? <div>{executionProjectHint}</div> : null}
      {missionContextLabel ? <div>{`context:${missionContextLabel}`}</div> : null}
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

import { NoctisTeamScreen } from "./noctis-team-screen";

const buildMission = (overrides: Partial<MissionResumePayload> = {}): MissionResumePayload => ({
  missionId: "mission-1",
  title: "Mission One",
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  status: "active",
  executionProjectId: "core-repo",
  contextProjectIds: ["docs-repo"],
  baseBranch: "main",
  branch: "mission/20260401-mission-one",
  workspacePath: "/tmp/worktrees/core-repo/mission-one",
  workspaceStatus: "ready",
  resumeBlockedReason: null,
  sessions: {
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
      isSessionActive: false,
      isStreaming: false,
      isLoadingHistory: false,
      availableOperations: [],
      selectedOperation: null,
      activeOperationState: null,
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
});
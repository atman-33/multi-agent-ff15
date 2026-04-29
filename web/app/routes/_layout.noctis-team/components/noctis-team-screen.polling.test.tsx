// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MissionSummary } from "@/lib/types/mission";

vi.hoisted(() => {
  const maybeWindow = globalThis as typeof globalThis & {
    window?: typeof globalThis & { __vite_plugin_react_preamble_installed__?: boolean };
    __vite_plugin_react_preamble_installed__?: boolean;
    $RefreshReg$?: (type: unknown, id: string) => void;
    $RefreshSig$?: () => <T>(type: T) => T;
  };

  if (maybeWindow.window) {
    maybeWindow.window.__vite_plugin_react_preamble_installed__ = true;
  }
  maybeWindow.__vite_plugin_react_preamble_installed__ = true;
  maybeWindow.$RefreshReg$ = () => undefined;
  maybeWindow.$RefreshSig$ = () => (type) => type;
});

const {
  agentSessionStateMock,
  matchMock,
  navigateMock,
  paramsMock,
  projectRegistryStateMock,
  sessionStatusFeedMock,
} = vi.hoisted(() => ({
  agentSessionStateMock: vi.fn(),
  matchMock: vi.fn(),
  navigateMock: vi.fn(),
  paramsMock: vi.fn(),
  projectRegistryStateMock: vi.fn(),
  sessionStatusFeedMock: vi.fn(),
}));

vi.mock("react-router", () => ({
  NavLink: ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useMatch: () => matchMock(),
  useNavigate: () => navigateMock,
  useParams: () => paramsMock(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/hooks/use-agent-session", () => ({
  useAgentSession: () => agentSessionStateMock(),
}));

vi.mock("@/hooks/use-project-registry", () => ({
  useProjectRegistry: () => projectRegistryStateMock(),
}));

vi.mock("@/hooks/use-session-status-feed", () => ({
  useSessionStatusFeed: (...args: unknown[]) => sessionStatusFeedMock(...args),
}));

vi.mock("@/components/workspace-launch-actions", () => ({
  WorkspaceLaunchActions: () => <div>workspace-launch-actions</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children?: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
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
  ChatArea: () => <div>chat-area</div>,
}));

vi.mock("./lunafreya-status-panel", () => ({
  LunafreyaStatusPanel: () => <div>lunafreya-status</div>,
}));

vi.mock("./mission-activity-log", () => ({
  MissionActivityLog: () => <div>mission-activity-log</div>,
}));

vi.mock("./mission-history-item", () => ({
  MissionHistoryItem: ({ mission }: { mission: MissionSummary }) => <div>{mission.title}</div>,
}));

vi.mock("./mission-output-browser", () => ({
  MissionOutputBrowser: () => <div>mission-output-browser</div>,
  getMissionOutputKey: ({ step, taskId, filename }: { step: string; taskId: string; filename: string }) =>
    `${step}:${taskId}:${filename}`,
}));

vi.mock("./party-status-panel", () => ({
  PartyStatusPanel: () => <div>party-status-panel</div>,
}));

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
  fetch?: typeof fetch;
};

const testWindow = globalThis as typeof globalThis & {
  __vite_plugin_react_preamble_installed__?: boolean;
};

function createMissionSummary(overrides: Partial<MissionSummary> = {}): MissionSummary {
  return {
    activitySessionIds: ["session-1"],
    agentStatuses: {
      gladiolus: "idle",
      ignis: "idle",
      noctis: "idle",
      prompto: "idle",
    },
    archivedAt: null,
    createdAt: "2026-04-29T00:00:00.000Z",
    latestPrimaryMessageCreatedAt: null,
    latestPrimaryMessageId: null,
    missionId: "mission-1",
    objective: undefined,
    primarySessionId: "session-1",
    status: "active",
    title: "Mission One",
    updatedAt: "2026-04-29T00:00:00.000Z",
    ...overrides,
  };
}

function createJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
    },
    status: 200,
  });
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function waitFor(assertion: () => undefined | boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await flushEffects();
    try {
      const result = assertion();
      if (result === false) {
        throw new Error("retry");
      }
      return;
    } catch {
      // retry
    }
  }

  assertion();
}

describe("noctis-team-screen mission list refresh", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    paramsMock.mockReturnValue({});
    matchMock.mockReturnValue(null);
    navigateMock.mockReset();
    projectRegistryStateMock.mockReturnValue({
      data: {
        projects: [
          {
            displayName: "Core Repo",
            id: "core-repo",
            path: "/repos/core",
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
    sessionStatusFeedMock.mockReturnValue({});

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }

    container?.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the loaded mission list visible instead of re-entering loading on a timer refresh", async () => {
    testWindow.__vite_plugin_react_preamble_installed__ = true;
    const { NoctisTeamScreen } = await import("./noctis-team-screen");

    let missionFetchCount = 0;
    testGlobal.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url !== "/api/noctis/missions?view=active") {
        throw new Error(`Unhandled fetch: ${url}`);
      }

      missionFetchCount += 1;
      if (missionFetchCount === 1) {
        return createJsonResponse({
          counts: { active: 1, archived: 1 },
          missions: [createMissionSummary()],
        });
      }

      return new Promise<Response>(() => undefined);
    }) as typeof fetch;

    await act(async () => {
      root?.render(
        <NoctisTeamScreen activeMissionId={null} initialMissionData={null} language="other" />,
      );
    });

    await waitFor(() => {
      expect(missionFetchCount).toBe(1);
      expect(container.textContent).toContain("Active (1)");
      expect(container.textContent).toContain("Archived (1)");
      return true;
    });

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(missionFetchCount).toBe(1);
  });
});
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSessionChatRenderSnapshot } from "@/lib/session-chat-rendering-orchestration";

const { chatStoreStateMock, projectIrisSheetPropsSpy, setAgentModelMock, useOwnedIrisSessionRealtimeMock } = vi.hoisted(() => ({
  chatStoreStateMock: vi.fn(),
  projectIrisSheetPropsSpy: vi.fn(),
  setAgentModelMock: vi.fn(),
  useOwnedIrisSessionRealtimeMock: vi.fn(() => ({
    clearStreaming: vi.fn(),
    isLiveUnavailable: false,
    liveDraft: null as
      | {
          messageId: string;
          parts: Array<{ text: string; type: string }> | undefined;
          sessionId: string;
        }
      | null,
    resetLiveThread: vi.fn(),
    sessionStatus: null as "busy" | "idle" | "retry" | null,
    streamingContent: "",
    streamingMessageId: null as string | null,
  })),
}));

vi.mock("@/components/workspace-launch-actions", () => ({
  WorkspaceLaunchActions: ({ path }: { path: string }) => <div data-workspace-launch-actions={path} />,
}));

vi.mock("@/stores/chat-store", () => ({
  useChatStore: (
    selector: (state: {
      agentModels: {
        iris?: { providerID: string; modelID: string; variant?: string } | null;
      };
      setAgentModel: typeof setAgentModelMock;
    }) => unknown,
  ) => selector(chatStoreStateMock()),
}));

vi.mock("@/hooks/use-vscode-preferences", () => ({
  useVSCodePreferences: () => ({
    vscodePreferences: {},
    updateVSCodePreference: () => undefined,
  }),
}));

vi.mock("@/hooks/use-owned-iris-session-realtime", () => ({
  useOwnedIrisSessionRealtime: useOwnedIrisSessionRealtimeMock,
}));

vi.mock("./components/project-iris-sheet", () => ({
  ProjectIrisSheet: (props: {
    onSelectedModelChange: (model: { providerID: string; modelID: string; variant?: string }) => void;
    selectedModel: { providerID: string; modelID: string; variant?: string } | null;
  }) => {
    projectIrisSheetPropsSpy(props);

    return (
      <div>
        {`project-iris-model:${props.selectedModel ? `${props.selectedModel.providerID}/${props.selectedModel.modelID}` : "none"}${props.selectedModel?.variant ? `:${props.selectedModel.variant}` : ""}`}
      </div>
    );
  },
}));

import {
  buildProjectIrisStartPayload,
  loader,
  normalizeProjectIrisHistoryMessages,
  ProjectsPage,
} from "./route";

const TestPage = ProjectsPage as unknown as (props: { loaderData: unknown }) => ReactNode;

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-projects-route-"));
  tempRoots.push(root);

  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "projects", "alpha"), { recursive: true });
  mkdirSync(join(root, "external-alpha"), { recursive: true });
  mkdirSync(join(root, ".opencode", "skills", "project-manage"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  writeFileSync(join(root, "config", "settings.yaml"), "language: en\n", "utf-8");
  writeFileSync(
    join(root, "projects", "alpha", "project.yaml"),
    [
      'id: "alpha"',
      'name: "Alpha Project"',
      'root_path: "../../external-alpha"',
      'serena_project: "alpha"',
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(root, ".opencode", "skills", "project-manage", "SKILL.md"),
    [
      "---",
      "name: project-manage",
      "description: Manage project registration and metadata updates.",
      "---",
      "# Project Manage",
      "",
    ].join("\n"),
    "utf-8",
  );

  return root;
}

afterEach(() => {
  if (originalRootEnv === undefined) {
    delete process.env.MULTI_AGENT_FF15_ROOT;
  } else {
    process.env.MULTI_AGENT_FF15_ROOT = originalRootEnv;
  }

  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

beforeEach(() => {
  projectIrisSheetPropsSpy.mockReset();
  setAgentModelMock.mockReset();
  useOwnedIrisSessionRealtimeMock.mockReset();
  useOwnedIrisSessionRealtimeMock.mockReturnValue({
    clearStreaming: vi.fn(),
    isLiveUnavailable: false,
    liveDraft: null,
    resetLiveThread: vi.fn(),
    sessionStatus: null,
    streamingContent: "",
    streamingMessageId: null,
  });
  chatStoreStateMock.mockReturnValue({
    agentModels: {
      iris: null,
    },
    setAgentModel: setAgentModelMock,
  });
});

describe("projects route", () => {
  it("loads the initial registry data and project-manage skill availability", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    await expect(loader()).resolves.toEqual({
      initialData: {
        projects: [
          {
            branchName: undefined,
            displayName: "Alpha Project",
            id: "alpha",
            path: join(process.env.MULTI_AGENT_FF15_ROOT as string, "external-alpha"),
          },
        ],
      },
      initialFetchError: null,
      projectManageSkill: {
        available: true,
        error: null,
        filePath: join(
          process.env.MULTI_AGENT_FF15_ROOT as string,
          ".opencode",
          "skills",
          "project-manage",
          "SKILL.md",
        ),
        promptContext: expect.stringContaining("project-manage"),
      },
    });
  });

  it("renders a single global Manage Projects with Iris entry point in the header", () => {
    const markup = renderToStaticMarkup(
      <TestPage
        loaderData={{
          initialData: {
            projects: [
              {
                branchName: "main",
                displayName: "Alpha Project",
                id: "alpha",
                path: "/home/atman/repos/alpha",
              },
            ],
          },
          initialFetchError: null,
          projectManageSkill: {
            available: true,
            error: null,
            filePath: "/home/atman/repos/multi-agent-ff15/.opencode/skills/project-manage/SKILL.md",
            promptContext: "<reference-files>project-manage</reference-files>",
          },
        }}
      />,
    );

    expect(markup).toContain("Manage Projects with Iris");
    expect(markup.match(/Manage Projects with Iris/g)).toHaveLength(1);
    expect(markup).toContain("Alpha Project");
    expect(markup).not.toContain("Manage with Iris");
  });

  it("renders the same Manage Projects with Iris entry point in the empty state", () => {
    const markup = renderToStaticMarkup(
      <TestPage
        loaderData={{
          initialData: {
            projects: [],
          },
          initialFetchError: null,
          projectManageSkill: {
            available: true,
            error: null,
            filePath: "/home/atman/repos/multi-agent-ff15/.opencode/skills/project-manage/SKILL.md",
            promptContext: "<reference-files>project-manage</reference-files>",
          },
        }}
      />,
    );

    expect(markup).toContain("No registered projects found.");
    expect(markup).toContain("Manage Projects with Iris");
    expect(markup).toContain("scripts/project_register.sh --id &lt;id&gt; ...");
  });

  it("shows an error but still exposes the global entry point when the pinned skill is unavailable", () => {
    const markup = renderToStaticMarkup(
      <TestPage
        loaderData={{
          initialData: {
            projects: [],
          },
          initialFetchError: null,
          projectManageSkill: {
            available: false,
            error: "Pinned project-manage skill is unavailable.",
            filePath: null,
            promptContext: null,
          },
        }}
      />,
    );

    expect(markup).toContain("Pinned project-manage skill is unavailable.");
    expect(markup).toContain("Manage Projects with Iris");
    expect(markup).not.toContain('disabled=""');
  });

  it("normalizes raw session API messages before building the restored Projects Iris render snapshot", () => {
    const presentationMessages = normalizeProjectIrisHistoryMessages([
      {
        info: {
          id: "message-1",
          role: "assistant",
          agent: "iris",
          time: { created: Date.parse("2026-04-21T10:00:01.000Z") },
        },
        parts: [{ type: "text", text: "Hello from Iris" }],
      },
    ]);

    const snapshot = buildSessionChatRenderSnapshot({
      messages: presentationMessages,
    });

    expect(snapshot.renderedMessages).toHaveLength(1);
    expect(snapshot.renderedMessages[0]?.messageDisplay.displayContent).toBe("Hello from Iris");
    expect(snapshot.renderedMessages[0]?.senderLabel).toBe("Iris");
  });

  it("reads the persisted Iris model from chat store and writes updates back through setAgentModel", () => {
    chatStoreStateMock.mockReturnValue({
      agentModels: {
        iris: {
          providerID: "openai",
          modelID: "gpt-5.4",
          variant: "thinking",
        },
      },
      setAgentModel: setAgentModelMock,
    });

    const markup = renderToStaticMarkup(
      <TestPage
        loaderData={{
          initialData: {
            projects: [],
          },
          initialFetchError: null,
          projectManageSkill: {
            available: true,
            error: null,
            filePath: "/home/atman/repos/multi-agent-ff15/.opencode/skills/project-manage/SKILL.md",
            promptContext: "<reference-files>project-manage</reference-files>",
          },
        }}
      />,
    );

    expect(markup).toContain("project-iris-model:openai/gpt-5.4:thinking");

    const sheetProps = projectIrisSheetPropsSpy.mock.calls.at(-1)?.[0];
    expect(sheetProps?.selectedModel).toEqual({
      providerID: "openai",
      modelID: "gpt-5.4",
      variant: "thinking",
    });

    sheetProps?.onSelectedModelChange({
      providerID: "github-copilot",
      modelID: "gpt-5.4",
      variant: "balanced",
    });

    expect(setAgentModelMock).toHaveBeenCalledWith("iris", {
      providerID: "github-copilot",
      modelID: "gpt-5.4",
      variant: "balanced",
    });
  });

  it("builds the Projects Iris start payload with the owned-session surface hint", () => {
    const selectedModel = {
      providerID: "openai",
      modelID: "gpt-5.4",
      variant: "thinking",
    };

    expect(
      buildProjectIrisStartPayload({
        model: selectedModel,
        parts: [{ type: "text", text: "Refresh the project registry." }],
      }),
    ).toEqual({
      agent: "iris",
      model: selectedModel,
      ownedSessionSurface: "projects-iris",
      parts: [{ type: "text", text: "Refresh the project registry." }],
    });
  });

  it("passes a live Projects Iris draft through to the sheet before authoritative history settles", () => {
    useOwnedIrisSessionRealtimeMock.mockReturnValue({
      clearStreaming: vi.fn(),
      isLiveUnavailable: false,
      liveDraft: {
        messageId: "assistant-1",
        parts: [{ text: "Refreshing the registry", type: "reasoning" }],
        sessionId: "session-project-iris-1",
      },
      resetLiveThread: vi.fn(),
      sessionStatus: "busy",
      streamingContent: "",
      streamingMessageId: "assistant-1",
    });

    renderToStaticMarkup(
      <TestPage
        loaderData={{
          initialData: {
            projects: [],
          },
          initialFetchError: null,
          projectManageSkill: {
            available: true,
            error: null,
            filePath: "/home/atman/repos/multi-agent-ff15/.opencode/skills/project-manage/SKILL.md",
            promptContext: "<reference-files>project-manage</reference-files>",
          },
        }}
      />,
    );

    const sheetProps = projectIrisSheetPropsSpy.mock.calls.at(-1)?.[0];
    expect(sheetProps?.renderSnapshot?.streamingMessage?.conversationUnitId).toBe("assistant-1");
    expect(sheetProps?.renderSnapshot?.streamingMessage?.parts).toEqual([
      { text: "Refreshing the registry", type: "reasoning" },
    ]);
    expect(sheetProps?.renderSnapshot?.streamingMessage?.senderLabel).toBe("Iris");
  });
});
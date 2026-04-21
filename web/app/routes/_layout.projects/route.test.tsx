import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSessionChatRenderSnapshot } from "@/lib/session-chat-rendering-orchestration";

vi.mock("@/components/workspace-launch-actions", () => ({
  WorkspaceLaunchActions: ({ path }: { path: string }) => <div data-workspace-launch-actions={path} />,
}));

vi.mock("@/hooks/use-vscode-preferences", () => ({
  useVSCodePreferences: () => ({
    vscodePreferences: {},
    updateVSCodePreference: () => undefined,
  }),
}));

import { loader, normalizeProjectIrisHistoryMessages, ProjectsPage } from "./route";

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
});
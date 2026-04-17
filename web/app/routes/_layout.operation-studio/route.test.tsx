import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProjectOperationRef } from "@/lib/operation-definition/operation-catalog";

const { buildOperationStudioPreviewBundleMock } = vi.hoisted(() => ({
  buildOperationStudioPreviewBundleMock: vi.fn(() => ({ flowSteps: [] })),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock("@/components/page-container", () => ({
  PageContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/resizable", () => ({
  ResizablePanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <div>{placeholder}</div>,
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, open }: { children: ReactNode; open?: boolean }) => (open ? <div>{children}</div> : null),
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: ({ value }: { value?: string }) => <textarea defaultValue={value} readOnly />,
}));

vi.mock("@/components/operation-studio/copyable-prompt-block", () => ({
  CopyablePromptBlock: ({ value }: { value: string }) => <pre>{value}</pre>,
}));

vi.mock("@/lib/operation-studio/preview-engine.server", () => ({
  buildOperationStudioPreviewBundle: buildOperationStudioPreviewBundleMock,
}));

import {
  buildOperationStudioIrisPromptPayload,
  buildOperationStudioIrisStartPayload,
  loader,
  OperationStudioPage,
} from "./route";

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];

function createTempRoot(language: string): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-operation-studio-route-"));
  tempRoots.push(root);

  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  writeFileSync(join(root, "config", "settings.yaml"), `language: ${language}\n`, "utf-8");

  return root;
}

function writeOperation(root: string, language: string, name: string, description: string): void {
  const operationsDirectory = join(root, "builtins", language, "operations");
  mkdirSync(operationsDirectory, { recursive: true });
  writeFileSync(
    join(operationsDirectory, `${name}.yaml`),
    [
      `name: ${name}`,
      `description: ${description}`,
      "initial_step: plan",
      "steps:",
      "  - name: plan",
      "    agent: noctis",
      "    instruction:",
      "      inline: Execute the plan",
      "    rules: []",
      "",
    ].join("\n"),
    "utf-8",
  );
}

function writeProjectManifest(root: string, id: string, name: string): void {
  const projectDir = join(root, "projects", id);
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    join(projectDir, "project.yaml"),
    [
      `id: "${id}"`,
      `name: "${name}"`,
      `root_path: "../../external-${id}"`,
      `serena_project: "${id}"`,
      "",
    ].join("\n"),
    "utf-8",
  );
}

function writeProjectOperation(root: string, projectId: string, name: string, description: string): void {
  const operationsDirectory = join(root, "projects", projectId, "operations");
  mkdirSync(operationsDirectory, { recursive: true });
  writeFileSync(
    join(operationsDirectory, `${name}.yaml`),
    [
      `name: ${name}`,
      `description: ${description}`,
      "initial_step: plan",
      "steps:",
      "  - name: plan",
      "    agent: noctis",
      "    instruction:",
      "      inline: Execute the plan",
      "    rules: []",
      "",
    ].join("\n"),
    "utf-8",
  );
}

function writeFile(root: string, relativePath: string, content: string): void {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf-8");
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }

  buildOperationStudioPreviewBundleMock.mockClear();

  if (originalRootEnv === undefined) {
    delete process.env.MULTI_AGENT_FF15_ROOT;
  } else {
    process.env.MULTI_AGENT_FF15_ROOT = originalRootEnv;
  }
});

describe("operation-studio route", () => {
  it("defaults to Noctis Team builtin authoring and previews the first saved operation", async () => {
    const root = createTempRoot("ja");
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeOperation(root, "ja", "noctis-autonomous", "Default conversational flow.");
    writeOperation(root, "ja", "openspec-dev", "OpenSpec delivery flow.");

    const loaderData = await loader({
      request: new Request("http://localhost/operation-studio"),
    } as never);

    expect(loaderData.scope).toBe("noctis_team");
    expect(loaderData.targetValue).toBe("builtin");
    expect(loaderData.operations.map((operation) => operation.value)).toEqual([
      "builtin:ja:noctis-autonomous.yaml",
      "builtin:ja:openspec-dev.yaml",
    ]);
    expect(loaderData.selectedOperation).toBe("builtin:ja:noctis-autonomous.yaml");
    expect(buildOperationStudioPreviewBundleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: {
          kind: "saved",
          operationRef: "builtin:ja:noctis-autonomous.yaml",
        },
      }),
    );
  });

  it("loads project authoring catalogs for the selected project target", async () => {
    const root = createTempRoot("ja");
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeOperation(root, "ja", "noctis-autonomous", "Default conversational flow.");
    writeProjectManifest(root, "alpha", "Alpha Project");
    writeProjectOperation(root, "alpha", "repo-review", "Alpha review flow.");

    const loaderData = await loader({
      request: new Request("http://localhost/operation-studio?target=project%3Aalpha"),
    } as never);

    expect(loaderData.targetValue).toBe("project:alpha");
    expect(loaderData.operations.map((operation) => operation.value)).toEqual([
      "builtin:ja:noctis-autonomous.yaml",
      buildProjectOperationRef("alpha", "repo-review.yaml"),
    ]);
  });

  it("loads Lunafreya facet catalogs from the bound authoring target and passes ambient context into preview", async () => {
    const root = createTempRoot("ja");
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeOperation(root, "ja", "lunafreya-autonomous", "Default Lunafreya flow.");
    writeProjectManifest(root, "alpha", "Alpha Project");
    writeFile(
      root,
      "builtins/ja/facets/jobs/lunafreya-autonomous.md",
      [
        "---",
        'name: Default (Lunafreya Autonomous)',
        'description: Reserved default Lunafreya job.',
        "---",
        "",
        "# Lunafreya Autonomous",
        "",
        "Guide User directly.",
      ].join("\n"),
    );
    writeFile(
      root,
      "builtins/ja/facets/jobs/strategist.md",
      [
        "---",
        'name: Strategic Advisor',
        'description: Adds structured strategic framing.',
        "---",
        "",
        "# Strategic Advisor",
      ].join("\n"),
    );
    writeFile(
      root,
      "builtins/ja/facets/skills/oracle-notes/SKILL.md",
      [
        "---",
        "name: oracle-notes",
        'description: Read when you need Lunafreya-specific long-horizon guidance.',
        "---",
        "",
        "# Oracle Notes",
      ].join("\n"),
    );
    writeFile(
      root,
      "projects/alpha/facets/jobs/domain-role.md",
      ["# Domain Role", "", "Project-specific job."].join("\n"),
    );
    writeFile(
      root,
      "projects/alpha/facets/skills/domain-notes/SKILL.md",
      [
        "---",
        "name: domain-notes",
        'description: Read this when project-specific terminology matters.',
        "---",
        "",
        "# Domain Notes",
      ].join("\n"),
    );

    const loaderData = await loader({
      request: new Request(
        "http://localhost/operation-studio?scope=lunafreya&target=project%3Aalpha&operation=builtin%3Aja%3Alunafreya-autonomous.yaml&lunafreyaJob=project%3Aalpha%3Ajobs%2Fdomain-role.md&lunafreyaSkills=project%3Aalpha%3Askills%2Fdomain-notes",
      ),
    } as never);

    expect(loaderData.selectedLunafreyaJobId).toBe("project:alpha:jobs/domain-role.md");
    expect(loaderData.selectedLunafreyaSkillIds).toEqual(["project:alpha:skills/domain-notes"]);
    expect(loaderData.lunafreyaJobOptions.map((option) => option.id)).toEqual([
      "builtin:ja:jobs/strategist.md",
      "project:alpha:jobs/domain-role.md",
    ]);
    expect(loaderData.lunafreyaSkillOptions.map((option) => option.id)).toEqual([
      "builtin:ja:skills/oracle-notes",
      "project:alpha:skills/domain-notes",
    ]);
    expect(buildOperationStudioPreviewBundleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lunafreyaPromptExtension: expect.stringContaining("Project-specific job."),
      }),
    );
  });

  it("renders the Operation Studio heading while preserving operation refs in the list", () => {
    const props = {
      loaderData: {
        activeStepId: "",
        lunafreyaJobOptions: [],
        lunafreyaSkillOptions: [],
        operations: [
          {
            description: "Default conversational flow.",
            isDefault: true,
            label: "Default (Autonomous)",
            name: "noctis-autonomous",
            sourceKind: "builtin",
            sourceLabel: "Builtin",
            value: "builtin:ja:noctis-autonomous.yaml",
          },
        ],
        partyMode: "full",
        preview: null,
        previewWorkers: ["ignis", "gladiolus", "prompto"],
        projects: [],
        scope: "noctis_team",
        selectedLunafreyaJobId: null,
        selectedLunafreyaSkillIds: [],
        selectedOperation: "builtin:ja:noctis-autonomous.yaml",
        targetValue: "builtin",
        taskInstruction: "Execute the current step according to the workflow context.",
        userMessage: "This is a synthetic User message for operation activation.",
      },
      matches: [] as never[],
      params: {},
    } as unknown as Parameters<typeof OperationStudioPage>[0];

    const markup = renderToStaticMarkup(<OperationStudioPage {...props} />);

    expect(markup).toContain("Operation Studio");
    expect(markup).toContain("Draft");
    expect(markup).toContain("New Draft");
    expect(markup).toContain("YAML");
    expect(markup).toContain("Default (Autonomous)");
    expect(markup).toContain('data-operation-value="builtin:ja:noctis-autonomous.yaml"');
  });

  it("builds Iris request payloads with a fixed iris agent and the selected model", () => {
    const selectedModel = {
      providerID: "openai",
      modelID: "gpt-5.4",
      variant: "thinking",
    };

    expect(
      buildOperationStudioIrisStartPayload({
        contextProjectIds: ["alpha"],
        executionProjectId: "alpha",
        model: selectedModel,
        parts: [{ type: "text", text: "Revise this operation." }],
      }),
    ).toEqual({
      agent: "iris",
      contextProjectIds: ["alpha"],
      executionProjectId: "alpha",
      model: selectedModel,
      parts: [{ type: "text", text: "Revise this operation." }],
    });

    expect(
      buildOperationStudioIrisPromptPayload({
        model: selectedModel,
        parts: [{ type: "text", text: "Explain the current prompt flow." }],
      }),
    ).toEqual({
      agent: "iris",
      model: selectedModel,
      parts: [{ type: "text", text: "Explain the current prompt flow." }],
    });
  });
});
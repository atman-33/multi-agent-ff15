import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProjectOperationRef } from "@/lib/operation-definition/operation-catalog";

const { buildOperationDebugBundleMock } = vi.hoisted(() => ({
  buildOperationDebugBundleMock: vi.fn(() => ({ flowSteps: [] })),
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
  ResizableHandle: () => <div />,
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

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, open }: { children: ReactNode; open?: boolean }) => (open ? <div>{children}</div> : null),
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: ({ value }: { value?: string }) => <textarea defaultValue={value} readOnly />,
}));

vi.mock("@/lib/prompt-composition-engine/debug-preview.server", () => ({
  buildOperationDebugBundle: buildOperationDebugBundleMock,
}));

vi.mock("./components/copyable-prompt-block", () => ({
  CopyablePromptBlock: ({ value }: { value: string }) => <pre>{value}</pre>,
}));

import { loader, OperationDebugPage } from "./route";

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];

function createTempRoot(language: string): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-operation-debug-route-"));
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
      "    job:",
      "      inline: Planner",
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
      "    job:",
      "      inline: Planner",
      "    instruction:",
      "      inline: Execute the plan",
      "    rules: []",
      "",
    ].join("\n"),
    "utf-8",
  );
}

function createPreviewStep(overrides: Record<string, unknown> = {}) {
  return {
    id: "autonomous:step:1",
    nodeKind: "step",
    parentId: null,
    topLevelStepId: "autonomous:step:1",
    stepName: "autonomous",
    stepIndex: 1,
    occurrence: 1,
    kind: "noctis-step",
    title: "autonomous",
    from: "User",
    to: "Noctis",
    pathSummary: "User -> Runtime -> Noctis",
    summary: "Autonomous step summary.",
    promptTitle: "Prompt",
    promptDescription: "",
    sourceInput: "",
    promptHighlights: [],
    internalContext: "",
    suppressedContext: "",
    injectedPrompt: "",
    effectivePrompt: "",
    completionTitle: "Contract",
    completionDescription: "",
    completionContract: "",
    runtimeDecision: "",
    decisionSummary: "",
    operationContextSummary: "",
    normalizedStep: {} as never,
    nextStep: "autonomous",
    nextAction: "continue_conversation",
    nextTarget: "Noctis",
    hookTrail: [],
    reportTransport: "",
    workflowGuidance: "",
    ...overrides,
  };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }

  buildOperationDebugBundleMock.mockClear();

  if (originalRootEnv === undefined) {
    delete process.env.MULTI_AGENT_FF15_ROOT;
  } else {
    process.env.MULTI_AGENT_FF15_ROOT = originalRootEnv;
  }
});

describe("operation-debug route", () => {
  it("defaults to the autonomous workflow value while including both ja options", async () => {
    const root = createTempRoot("ja");
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeOperation(root, "ja", "openspec-dev", "OpenSpec delivery flow.");
    writeOperation(root, "ja", "noctis-autonomous", "Default conversational flow.");

    const loaderData = await loader({
      request: new Request("http://localhost/operation-debug"),
    } as never);

    expect(loaderData.operations.map((operation) => operation.value)).toEqual([
      "builtin:ja:noctis-autonomous.yaml",
      "builtin:ja:openspec-dev.yaml",
    ]);
    expect(loaderData.selectedOperation).toBe("builtin:ja:noctis-autonomous.yaml");
    expect(loaderData.partyMode).toBe("full");
    expect(loaderData.previewWorkers).toEqual(["ignis", "gladiolus", "prompto"]);
    expect(buildOperationDebugBundleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operationRef: "builtin:ja:noctis-autonomous.yaml",
        previewAllowedWorkers: ["ignis", "gladiolus", "prompto"],
      }),
    );
  });

  it("loads solo preview mode from query params", async () => {
    const root = createTempRoot("ja");
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeOperation(root, "ja", "noctis-autonomous", "Default conversational flow.");

    const loaderData = await loader({
      request: new Request("http://localhost/operation-debug?partyMode=solo"),
    } as never);

    expect(loaderData.partyMode).toBe("solo");
    expect(loaderData.previewWorkers).toEqual([]);
    expect(buildOperationDebugBundleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operationRef: "builtin:ja:noctis-autonomous.yaml",
        previewAllowedWorkers: [],
      }),
    );
  });

  it("includes project-authored workflows alongside builtin options", async () => {
    const root = createTempRoot("ja");
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeOperation(root, "ja", "noctis-autonomous", "Default conversational flow.");
    writeProjectManifest(root, "alpha", "Alpha Project");
    writeProjectManifest(root, "beta", "Beta Project");
    writeProjectOperation(root, "alpha", "repo-review", "Alpha review flow.");
    writeProjectOperation(root, "beta", "repo-review", "Beta review flow.");

    const loaderData = await loader({
      request: new Request("http://localhost/operation-debug"),
    } as never);

    expect(loaderData.operations.map((operation) => operation.value)).toEqual([
      "builtin:ja:noctis-autonomous.yaml",
      buildProjectOperationRef("alpha", "repo-review.yaml"),
      buildProjectOperationRef("beta", "repo-review.yaml"),
    ]);
  });

  it("renders operation list entries while preserving the underlying operation value", () => {
    const props = {
      loaderData: {
        activeStepId: "",
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
          {
            description: "OpenSpec delivery flow.",
            isDefault: false,
            label: "openspec-dev",
            name: "openspec-dev",
            sourceKind: "builtin",
            sourceLabel: "Builtin",
            value: "builtin:ja:openspec-dev.yaml",
          },
        ],
        partyMode: "full",
        preview: null,
        previewWorkers: ["ignis", "gladiolus", "prompto"],
        selectedOperation: "builtin:ja:noctis-autonomous.yaml",
        taskInstruction: "Execute the current step according to the workflow context.",
        userMessage: "This is a synthetic User message for operation activation.",
      },
      matches: [] as never[],
      params: {},
    } as unknown as Parameters<typeof OperationDebugPage>[0];

    const markup = renderToStaticMarkup(
      <OperationDebugPage {...props} />,
    );

    expect(markup).toContain("Default (Autonomous)");
    expect(markup).toContain("openspec-dev");
    expect(markup).toContain('data-operation-value="builtin:ja:noctis-autonomous.yaml"');
  });

  it("groups delegated child events under the same top-level step number", () => {
    const parent = createPreviewStep();
    const dispatch = createPreviewStep({
      id: "autonomous:step:1:delegated-dispatch",
      nodeKind: "delegated-dispatch",
      parentId: parent.id,
      topLevelStepId: parent.id,
      kind: "worker-step",
      title: "Dispatch to Ignis",
      from: "Noctis",
      to: "Ignis",
      pathSummary: "Noctis -> Runtime -> Ignis",
      summary: "Child task",
      nextAction: "await_child_report",
      nextTarget: "Ignis",
    });
    const delegatedReturn = createPreviewStep({
      id: "autonomous:step:1:delegated-return",
      nodeKind: "delegated-return",
      parentId: parent.id,
      topLevelStepId: parent.id,
      title: "Return from Ignis",
      from: "Ignis",
      to: "Noctis",
      pathSummary: "Ignis -> Runtime -> Noctis",
      summary: "Same step",
      sourceInput: "Synthetic report from worker",
      completionTitle: "Worker -> Runtime Report Transport",
      completionContract: "agent: ignis",
      runtimeDecision: "next_action: return_to_self_step",
      nextAction: "return_to_self_step",
      nextTarget: "Noctis",
    });

    const props = {
      loaderData: {
        activeStepId: delegatedReturn.id,
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
        preview: { flowSteps: [parent, dispatch, delegatedReturn] },
        previewWorkers: ["ignis", "gladiolus", "prompto"],
        selectedOperation: "builtin:ja:noctis-autonomous.yaml",
        taskInstruction: "Execute the current step according to the workflow context.",
        userMessage: "This is a synthetic User message for operation activation.",
      },
      matches: [] as never[],
      params: {},
    } as unknown as Parameters<typeof OperationDebugPage>[0];

    const markup = renderToStaticMarkup(
      <OperationDebugPage {...props} />,
    );

    expect(markup).toContain("Step 1");
    expect(markup).not.toContain("Step 2");
    expect(markup).toContain("Dispatch to Ignis");
    expect(markup).toContain("Return from Ignis");
    expect(markup).toContain("Child task");
    expect(markup).toContain("Same step");
    expect(markup).toContain("Child Event");
  });

  it("renders solo loop labeling and the no-flow explanation", () => {
    const soloStep = createPreviewStep({
      isSoloLoop: true,
      noFlowExplanation:
        "Delegation is unavailable because the effective allowed worker set is empty. Runtime retains the same autonomous step.",
      nextAction: "continue_conversation",
      nextTarget: "Noctis",
    });

    const props = {
      loaderData: {
        activeStepId: soloStep.id,
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
        partyMode: "solo",
        preview: { flowSteps: [soloStep] },
        previewWorkers: [],
        selectedOperation: "builtin:ja:noctis-autonomous.yaml",
        taskInstruction: "Execute the current step according to the workflow context.",
        userMessage: "This is a synthetic User message for operation activation.",
      },
      matches: [] as never[],
      params: {},
    } as unknown as Parameters<typeof OperationDebugPage>[0];

    const markup = renderToStaticMarkup(
      <OperationDebugPage {...props} />,
    );

    expect(markup).toContain("Solo Loop");
    expect(markup).toContain("Why No Flow?");
    expect(markup).toContain("Solo preview · No delegation available");
    expect(markup).toContain("Loop: Continue with Noctis");
  });
});
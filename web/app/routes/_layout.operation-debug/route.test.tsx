import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/components/ui/textarea", () => ({
  Textarea: ({ value }: { value?: string }) => <textarea defaultValue={value} readOnly />,
}));

vi.mock("@/lib/prompt-composition-engine/debug-preview.server", () => ({
  buildOperationDebugBundle: buildOperationDebugBundleMock,
}));

vi.mock("./components/copyable-prompt-block", () => ({
  CopyablePromptBlock: ({ content }: { content: string }) => <pre>{content}</pre>,
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
      "noctis-autonomous",
      "openspec-dev",
    ]);
    expect(loaderData.selectedOperation).toBe("noctis-autonomous");
    expect(buildOperationDebugBundleMock).toHaveBeenCalledWith(
      expect.objectContaining({ operationName: "noctis-autonomous" }),
    );
  });

  it("renders selector labels while preserving the underlying operation value", () => {
    const props = {
      loaderData: {
        activeStepId: "",
        operations: [
          {
            description: "Default conversational flow.",
            isDefault: true,
            label: "Default (Autonomous)",
            value: "noctis-autonomous",
          },
          {
            description: "OpenSpec delivery flow.",
            isDefault: false,
            label: "openspec-dev",
            value: "openspec-dev",
          },
        ],
        preview: null,
        selectedOperation: "noctis-autonomous",
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
    expect(markup).toContain('data-value="noctis-autonomous"');
  });
});
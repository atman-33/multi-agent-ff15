import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildBuiltinOperationRef } from "@/lib/operation-definition/operation-catalog";
import type { OperationDefinition } from "@/lib/operation-definition/types";
import { buildOperationStudioPreviewBundle } from "./preview-engine.server";

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];

function createTempRoot(language: string): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-operation-studio-preview-"));
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

  if (originalRootEnv === undefined) {
    delete process.env.MULTI_AGENT_FF15_ROOT;
  } else {
    process.env.MULTI_AGENT_FF15_ROOT = originalRootEnv;
  }
});

describe("operation-studio preview engine", () => {
  it("builds a preview bundle from a saved operation source", () => {
    const root = createTempRoot("ja");
    process.env.MULTI_AGENT_FF15_ROOT = root;
    writeOperation(root, "ja", "saved-flow", "Saved operation preview.");

    const bundle = buildOperationStudioPreviewBundle({
      source: {
        kind: "saved",
        operationRef: buildBuiltinOperationRef("ja", "saved-flow.yaml"),
      },
    });

    expect(bundle.operation.name).toBe("saved-flow");
    expect(bundle.flowSteps[0]?.stepName).toBe("plan");
  });

  it("builds a preview bundle from a draft operation source", () => {
    const root = createTempRoot("ja");
    process.env.MULTI_AGENT_FF15_ROOT = root;
    writeOperation(root, "ja", "saved-flow", "Saved operation preview.");

    const draftOperation: OperationDefinition = {
      sourcePath: join(root, "builtins", "ja", "operations", "saved-flow.yaml"),
      name: "draft-flow",
      description: "Draft operation preview.",
      initial_step: "draft-step",
      jobs: {},
      instructions: {},
      skills: {},
      policies: {},
      steps: [
        {
          name: "draft-step",
          agent: "noctis",
          job: { inline: "Draft Planner" },
          instruction: { inline: "Review the draft" },
          rules: [],
        },
      ],
    };

    const bundle = buildOperationStudioPreviewBundle({
      source: {
        kind: "draft",
        draftId: "draft-1",
        operation: draftOperation,
        operationRef: buildBuiltinOperationRef("ja", "saved-flow.yaml"),
      },
    });

    expect(bundle.operation.name).toBe("draft-flow");
    expect(bundle.flowSteps[0]?.stepName).toBe("draft-step");
    expect(bundle.flowSteps[0]?.effectivePrompt).toContain("Review the draft");
  });

  it("applies Lunafreya ambient prompt context to the primary preview prompt", () => {
    const root = createTempRoot("ja");
    process.env.MULTI_AGENT_FF15_ROOT = root;
    writeOperation(root, "ja", "saved-flow", "Saved operation preview.");

    const bundle = buildOperationStudioPreviewBundle({
      source: {
        kind: "draft",
        draftId: "draft-lunafreya",
        operation: {
          sourcePath: join(root, "builtins", "ja", "operations", "lunafreya-autonomous.yaml"),
          name: "lunafreya-autonomous",
          description: "Draft Lunafreya operation preview.",
          initial_step: "oracle",
          jobs: {},
          instructions: {},
          skills: {},
          policies: {},
          steps: [
            {
              name: "oracle",
              agent: "lunafreya",
              instruction: { inline: "Offer calm guidance." },
              rules: [],
            },
          ],
        },
      },
      lunafreyaPromptExtension: [
        "<job>",
        "# Strategic Advisor",
        "Anchor the response in project context.",
        "</job>",
        "<reference-files>",
        "<reference-file><name>domain-notes</name></reference-file>",
        "</reference-files>",
      ].join("\n"),
    });

    expect(bundle.flowSteps[0]?.to).toBe("Lunafreya");
    expect(bundle.flowSteps[0]?.effectivePrompt).toContain("Offer calm guidance.");
    expect(bundle.flowSteps[0]?.effectivePrompt).toContain("Strategic Advisor");
    expect(bundle.flowSteps[0]?.effectivePrompt).toContain("domain-notes");
  });
});
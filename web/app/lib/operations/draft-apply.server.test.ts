import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadOperationFromFile, loadOperationFromText } from "@/lib/operation-definition/operation-loader";
import type { OperationDefinition } from "@/lib/operation-definition/types";
import { applyOperationsDraft, planOperationsDraftApply } from "./draft-apply.server";

const tempRoots: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(language = "ja"): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-operations-"));
  tempRoots.push(root);
  mkdirSync(join(root, "builtins", language, "operations"), { recursive: true });
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "config", "settings.yaml"), `language: ${language}\n`, "utf-8");
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

function writeProjectDefinition(root: string, projectId: string): void {
  const projectDir = join(root, "projects", projectId);
  const projectRoot = join(root, `external-${projectId}`);
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(
    join(projectDir, "project.yaml"),
    [
      `id: ${projectId}`,
      `name: ${projectId}`,
      `root_path: ${projectRoot}`,
      "serena_project: ''",
      "",
    ].join("\n"),
    "utf-8",
  );
}

function createOperationDefinition(root: string, name: string): OperationDefinition {
  return {
    sourcePath: join(root, "runtime", `${name}.yaml`),
    name,
    description: `${name} description`,
    initial_step: "plan",
    jobs: {},
    instructions: {},
    skills: {},
    policies: {},
    steps: [
      {
        name: "plan",
        agent: "noctis",
        instruction: { inline: `Plan work for ${name}.` },
        rules: [{ condition: "Plan complete", next: "implement" }],
      },
      {
        name: "implement",
        agent: "ignis",
        instruction: { inline: `Implement ${name}.` },
        rules: [{ condition: "Done", next: "COMPLETE" }],
      },
    ],
  };
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

describe("draft-apply.server", () => {
  it("plans builtin draft writes in the configured builtin language and validates the generated YAML", () => {
    const root = createTempRoot("ja");
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const plan = planOperationsDraftApply({
      target: { kind: "builtin", projectId: null },
      operation: createOperationDefinition(root, "studio-plan"),
    });

    expect(plan.operationName).toBe("studio-plan");
    expect(plan.operationRef).toBe("builtin:ja:studio-plan.yaml");
    expect(plan.changes).toEqual([
      {
        action: "write",
        path: join(root, "builtins", "ja", "operations", "studio-plan.yaml"),
      },
    ]);

    const validated = loadOperationFromText(
      plan.yaml,
      join(root, "builtins", "ja", "operations", "studio-plan.yaml"),
    );
    expect(validated.name).toBe("studio-plan");
    expect(validated.steps).toHaveLength(2);
  });

  it("applies builtin draft renames against the original builtin source location", () => {
    const root = createTempRoot("ja");
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const originalPath = join(root, "builtins", "en", "operations", "saved-flow.yaml");
    mkdirSync(join(root, "builtins", "en", "operations"), { recursive: true });
    writeFileSync(
      originalPath,
      readFileSync(
        writeSeedOperation(root, "saved-flow"),
        "utf-8",
      ),
      "utf-8",
    );

    const result = applyOperationsDraft({
      sourceOperationRef: "builtin:en:saved-flow.yaml",
      target: { kind: "builtin", projectId: null },
      operation: createOperationDefinition(root, "renamed-flow"),
    });

    const renamedPath = join(root, "builtins", "en", "operations", "renamed-flow.yaml");
    expect(result.operationRef).toBe("builtin:en:renamed-flow.yaml");
    expect(result.changes).toEqual([
      {
        action: "write",
        path: renamedPath,
      },
      {
        action: "delete",
        path: originalPath,
      },
    ]);
    expect(existsSync(originalPath)).toBe(false);
    expect(loadOperationFromFile(renamedPath).name).toBe("renamed-flow");
  });

  it("applies project-targeted drafts into the selected registered project authoring directory", () => {
    const root = createTempRoot("ja");
    process.env.MULTI_AGENT_FF15_ROOT = root;
    writeProjectDefinition(root, "alpha");

    const result = applyOperationsDraft({
      target: { kind: "project", projectId: "alpha" },
      operation: createOperationDefinition(root, "project-review"),
    });

    const projectPath = join(root, "projects", "alpha", "operations", "project-review.yaml");
    expect(result.operationRef).toBe("project:alpha:project-review.yaml");
    expect(result.changes).toEqual([
      {
        action: "write",
        path: projectPath,
      },
    ]);
    expect(loadOperationFromFile(projectPath).name).toBe("project-review");
  });
});

function writeSeedOperation(root: string, name: string): string {
  const path = join(root, `${name}.seed.yaml`);
  writeFileSync(
    path,
    [
      `name: ${name}`,
      `description: ${name} description`,
      "initial_step: plan",
      "steps:",
      "  - name: plan",
      "    agent: noctis",
      "    instruction:",
      `      inline: Plan work for ${name}.`,
      "    rules:",
      "      - condition: Plan complete",
      "        next: implement",
      "  - name: implement",
      "    agent: ignis",
      "    instruction:",
      `      inline: Implement ${name}.`,
      "    rules:",
      "      - condition: Done",
      "        next: COMPLETE",
      "",
    ].join("\n"),
    "utf-8",
  );
  return path;
}
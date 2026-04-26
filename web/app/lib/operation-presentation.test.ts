import { describe, expect, it } from "vitest";
import {
  compareOperationOptions,
  DEFAULT_AUTONOMOUS_OPERATION_LABEL,
  getOperationDisplayLabel,
  type OperationOption,
  toOperationOption,
} from "./operation-presentation";

describe("operation-presentation", () => {
  it("aliases the autonomous workflow label for the UI", () => {
    expect(getOperationDisplayLabel("noctis-autonomous")).toBe(
      DEFAULT_AUTONOMOUS_OPERATION_LABEL,
    );
    expect(getOperationDisplayLabel("test-review-cycle-flow")).toBe("test-review-cycle-flow");
  });

  it("normalizes multiline descriptions when building select options", () => {
    expect(
      toOperationOption({
        ref: "builtin:ja:test-review-cycle-flow.yaml",
        name: "test-review-cycle-flow",
        description: "Guided operation.\n  Plans, implements, and reviews.",
        isDefault: false,
        sourceKind: "builtin",
      }),
    ).toEqual({
      value: "builtin:ja:test-review-cycle-flow.yaml",
      label: "test-review-cycle-flow",
      description: "Guided operation. Plans, implements, and reviews.",
      isDefault: false,
      name: "test-review-cycle-flow",
      sourceKind: "builtin",
      sourceLabel: "Builtin",
    });
  });

  it("adds project source metadata to project-authored workflow labels", () => {
    expect(
      toOperationOption({
        ref: "project:multi-agent-ff15:test-review-cycle-flow.yaml",
        name: "test-review-cycle-flow",
        description: "Project-local operation.",
        isDefault: false,
        sourceKind: "project",
        projectId: "multi-agent-ff15",
        projectName: "Multi Agent FF15",
      }),
    ).toEqual({
      value: "project:multi-agent-ff15:test-review-cycle-flow.yaml",
      label: "test-review-cycle-flow · Multi Agent FF15",
      description: "Project-local operation.",
      isDefault: false,
      name: "test-review-cycle-flow",
      projectId: "multi-agent-ff15",
      sourceKind: "project",
      sourceLabel: "Multi Agent FF15",
    });
  });

  it("sorts the default workflow before other options", () => {
    const options = [
      {
        value: "builtin:ja:test-review-cycle-flow.yaml",
        label: "test-review-cycle-flow",
        description: "OpenSpec delivery flow.",
        isDefault: false,
        name: "test-review-cycle-flow",
        sourceKind: "builtin",
        sourceLabel: "Builtin",
      },
      {
        value: "builtin:ja:noctis-autonomous.yaml",
        label: DEFAULT_AUTONOMOUS_OPERATION_LABEL,
        description: "Default conversational flow.",
        isDefault: true,
        name: "noctis-autonomous",
        sourceKind: "builtin",
        sourceLabel: "Builtin",
      },
    ] satisfies OperationOption[];
    const sorted = [...options].sort(compareOperationOptions);

    expect(sorted.map((operation) => operation.value)).toEqual([
      "builtin:ja:noctis-autonomous.yaml",
      "builtin:ja:test-review-cycle-flow.yaml",
    ]);
  });
});
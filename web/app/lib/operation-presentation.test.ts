import { describe, expect, it } from "vitest";
import {
  compareOperationOptions,
  DEFAULT_AUTONOMOUS_OPERATION_LABEL,
  getOperationDisplayLabel,
  toOperationOption,
} from "./operation-presentation";

describe("operation-presentation", () => {
  it("aliases the autonomous workflow label for the UI", () => {
    expect(getOperationDisplayLabel("noctis-autonomous")).toBe(
      DEFAULT_AUTONOMOUS_OPERATION_LABEL,
    );
    expect(getOperationDisplayLabel("openspec-dev")).toBe("openspec-dev");
  });

  it("normalizes multiline descriptions when building select options", () => {
    expect(
      toOperationOption({
        name: "openspec-dev",
        description: "Guided workflow.\n  Plans, implements, and reviews.",
      }),
    ).toEqual({
      value: "openspec-dev",
      label: "openspec-dev",
      description: "Guided workflow. Plans, implements, and reviews.",
      isDefault: false,
    });
  });

  it("sorts the default workflow before other options", () => {
    const sorted = [
      {
        value: "openspec-dev",
        label: "openspec-dev",
        description: "OpenSpec delivery flow.",
        isDefault: false,
      },
      {
        value: "noctis-autonomous",
        label: DEFAULT_AUTONOMOUS_OPERATION_LABEL,
        description: "Default conversational flow.",
        isDefault: true,
      },
    ].sort(compareOperationOptions);

    expect(sorted.map((operation) => operation.value)).toEqual([
      "noctis-autonomous",
      "openspec-dev",
    ]);
  });
});
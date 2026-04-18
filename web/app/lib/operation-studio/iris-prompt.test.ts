import { describe, expect, it } from "vitest";
import type { PromptPart } from "@/lib/prompt-parts";
import {
  buildOperationStudioIrisContextText,
  prependOperationStudioIrisContext,
} from "./iris-prompt";

describe("operation-studio iris-prompt", () => {
  it("builds a Studio context block with scope, target, selection, and preview metadata", () => {
    const text = buildOperationStudioIrisContextText({
      draftPreviewPartySummary: "Full party preview · All workers available",
      scopeLabel: "Noctis Team",
      selectedEntryDescription: "Default conversational flow.",
      selectedEntryLabel: "Default (Autonomous)",
      selectedNodeBadge: "Step",
      selectedStepNumber: 2,
      selectedStepTitle: "plan",
      targetLabel: "Builtin · No project",
      taskInstruction: "Execute the current step according to the workflow context.",
      userMessage: "Investigate the current issue.",
    });

    expect(text).toContain("<operation-studio-context>");
    expect(text).toContain("scope: Noctis Team");
    expect(text).toContain("authoring_target: Builtin · No project");
    expect(text).toContain("selected_entry: Default (Autonomous)");
    expect(text).toContain("selected_preview_step: Step 2 · plan");
    expect(text).toContain("preview_party: Full party preview · All workers available");
  });

  it("formats the Studio context as hidden prompt context without a visible instruction suffix", () => {
    const text = buildOperationStudioIrisContextText({
      scopeLabel: "Noctis Team",
      selectedEntryLabel: "github-issue-openspec-dev",
      targetLabel: "Builtin · No project",
    });

    expect(text).toContain("<operation-studio-context>");
    expect(text).toContain("</operation-studio-context>");
    expect(text).not.toContain("<operation_studio_context>");
    expect(text).not.toContain(
      "Use this as the current Operation Studio context when you suggest revisions or explain the selected operation.",
    );
  });

  it("prepends the current Studio context ahead of the user-authored prompt parts", () => {
    const parts: PromptPart[] = [
      { type: "file", path: "docs/worker-handoff.md" },
      { type: "text", text: "Please suggest a cleaner worker handoff." },
    ];

    const result = prependOperationStudioIrisContext(
      {
        scopeLabel: "Lunafreya",
        selectedEntryLabel: "lunafreya-autonomous",
        targetLabel: "Project · Alpha",
      },
      parts,
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ type: "text" });
    expect(result[0]?.type).toBe("text");
    if (result[0]?.type === "text") {
      expect(result[0].text).toContain("scope: Lunafreya");
      expect(result[0].text).toContain("selected_entry: lunafreya-autonomous");
    }
    expect(result[1]).toEqual(parts[0]);
    expect(result[2]?.type).toBe("text");
    if (result[2]?.type === "text") {
      expect(result[2].text).toContain('<user-request from="user" to="iris">');
      expect(result[2].text).toContain("Please suggest a cleaner worker handoff.");
      expect(result[2].text).toContain("</user-request>");
    }
  });

  it("keeps file-only prompts as file parts without adding an empty user-request wrapper", () => {
    const parts: PromptPart[] = [{ type: "file", path: "docs/worker-handoff.md" }];

    const result = prependOperationStudioIrisContext(
      {
        scopeLabel: "Lunafreya",
        selectedEntryLabel: "lunafreya-autonomous",
        targetLabel: "Project · Alpha",
      },
      parts,
    );

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual(parts[0]);
  });
});
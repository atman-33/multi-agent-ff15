import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PreviewInputsSheet } from "./preview-inputs-sheet";

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
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

vi.mock("@/components/ui/textarea", () => ({
  Textarea: ({ value }: { value?: string }) => <textarea defaultValue={value} readOnly />,
}));

vi.mock("./lunafreya-facet-controls", () => ({
  LunafreyaFacetControls: () => <div>Lunafreya Facet Controls</div>,
}));

describe("preview-inputs-sheet", () => {
  it("keeps the common user-message control visible while hiding delegation-oriented controls when they are irrelevant", () => {
    const markup = renderToStaticMarkup(
      <PreviewInputsSheet
        draftPreviewPartySummary="Solo preview"
        isOpen={true}
        onApplyPreview={() => undefined}
        onClose={() => undefined}
        onPartyModeChange={() => undefined}
        onSelectedLunafreyaJobIdChange={() => undefined}
        onSelectedLunafreyaSkillIdsChange={() => undefined}
        onTargetValueChange={() => undefined}
        onTaskInstructionChange={() => undefined}
        onTogglePreviewWorker={() => undefined}
        onUserMessageChange={() => undefined}
        partyMode="full"
        previewWorkers={[]}
        scope="noctis_team"
        selectedEntryDescription="Noctis-only flow"
        selectedEntryLabel="Default (Autonomous)"
        selectedLunafreyaJobId={null}
        selectedLunafreyaSkillIds={[]}
        showPartyModeControls={false}
        showWorkerTaskSeedControl={false}
        targetOptions={[{ label: "Builtin · No project", value: "builtin" }]}
        targetValue="builtin"
        taskInstruction="Worker seed"
        userMessage="User prompt"
      />,
    );

    expect(markup).toContain("Preview Inputs");
    expect(markup).toContain("User Message");
    expect(markup).not.toContain("Party Mode");
    expect(markup).not.toContain("Worker Task Seed");
  });

  it("shows delegation and Lunafreya ambient controls when the selected operation depends on them", () => {
    const markup = renderToStaticMarkup(
      <PreviewInputsSheet
        draftPreviewPartySummary="Full party preview"
        isOpen={true}
        lunafreyaJobOptions={[{ id: "job-1", label: "Strategist" }]}
        lunafreyaSkillOptions={[{ id: "skill-1", label: "oracle-notes" }]}
        onApplyPreview={() => undefined}
        onClose={() => undefined}
        onPartyModeChange={() => undefined}
        onSelectedLunafreyaJobIdChange={() => undefined}
        onSelectedLunafreyaSkillIdsChange={() => undefined}
        onTargetValueChange={() => undefined}
        onTaskInstructionChange={() => undefined}
        onTogglePreviewWorker={() => undefined}
        onUserMessageChange={() => undefined}
        partyMode="custom"
        previewWorkers={["ignis"]}
        scope="lunafreya"
        selectedEntryDescription="Delegation-aware Lunafreya flow"
        selectedEntryLabel="lunafreya-autonomous"
        selectedLunafreyaJobId="job-1"
        selectedLunafreyaSkillIds={["skill-1"]}
        showPartyModeControls={true}
        showWorkerTaskSeedControl={true}
        targetOptions={[{ label: "Project · Alpha", value: "project:alpha" }]}
        targetValue="project:alpha"
        taskInstruction="Worker seed"
        userMessage="User prompt"
      />,
    );

    expect(markup).toContain("Party Mode");
    expect(markup).toContain("Worker Task Seed");
    expect(markup).toContain("Lunafreya Facet Controls");
  });
});
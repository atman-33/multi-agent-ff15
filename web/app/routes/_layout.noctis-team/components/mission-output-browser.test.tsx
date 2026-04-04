import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MissionOutputDocument, MissionOutputSummary } from "@/lib/types/mission";

vi.mock("@/components/markdown-document-sheet-preview", () => ({
  MarkdownDocumentSheetPreview: ({ title }: { title: string }) => <section>{title}</section>,
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetClose: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { MissionOutputBrowser } from "./mission-output-browser";

const baseOutput: MissionOutputSummary = {
  step: "review",
  taskId: "task-review-1",
  filename: "code-review.md",
  title: "Code review",
  author: "Ignis",
  date: "2026-04-05T00:00:00.000Z",
  filePath: "/tmp/runtime/noctis-missions/mission/outputs/review/task-review-1/code-review.md",
  tags: [],
};

const baseDocument: MissionOutputDocument = {
  ...baseOutput,
  content: "# Review\n",
  rawContent: "# Review\n",
};

describe("mission-output-browser", () => {
  it("renders an empty state when no outputs exist", () => {
    const markup = renderToStaticMarkup(
      <MissionOutputBrowser
        currentStep={null}
        isLoadingOutputs={false}
        isLoadingPreview={false}
        onPreviewOpenChange={() => undefined}
        onReload={() => undefined}
        onSelectOutput={() => undefined}
        outputs={[]}
        outputsError={null}
        previewDocument={null}
        previewError={null}
        previewOpen={false}
        selectedOutput={null}
      />,
    );

    expect(markup).toContain("No outputs yet");
    expect(markup).toContain("This mission has not generated any workflow output files yet.");
  });

  it("renders grouped outputs and highlights the current step", () => {
    const markup = renderToStaticMarkup(
      <MissionOutputBrowser
        currentStep="review"
        isLoadingOutputs={false}
        isLoadingPreview={false}
        onPreviewOpenChange={() => undefined}
        onReload={() => undefined}
        onSelectOutput={() => undefined}
        outputs={[
          baseOutput,
          {
            ...baseOutput,
            step: "fix",
            taskId: "task-fix-1",
            filename: "fix-notes.md",
            title: "Fix notes",
            date: "2026-04-04T00:00:00.000Z",
            filePath: "/tmp/runtime/noctis-missions/mission/outputs/fix/task-fix-1/fix-notes.md",
          },
        ]}
        outputsError={null}
        previewDocument={null}
        previewError={null}
        previewOpen={false}
        selectedOutput={baseOutput}
      />,
    );

    expect(markup).toContain("Current step");
    expect(markup).toContain("task-review-1");
    expect(markup).toContain("Code review");
    expect(markup).toContain("Fix notes");
  });

  it("renders a preview sheet payload when a document is selected", () => {
    const markup = renderToStaticMarkup(
      <MissionOutputBrowser
        currentStep="review"
        isLoadingOutputs={false}
        isLoadingPreview={false}
        onPreviewOpenChange={() => undefined}
        onReload={() => undefined}
        onSelectOutput={() => undefined}
        outputs={[baseOutput]}
        outputsError={null}
        previewDocument={baseDocument}
        previewError={null}
        previewOpen={true}
        selectedOutput={baseOutput}
      />,
    );

    expect(markup).toContain("Code review");
    expect(markup).toContain("task-review-1");
  });
});
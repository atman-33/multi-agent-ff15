import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MissionOutputSummary } from "@/lib/types/mission";

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

describe("mission-output-browser", () => {
  it("renders an empty state when no outputs exist", () => {
    const markup = renderToStaticMarkup(
      <MissionOutputBrowser
        currentStep={null}
        isLoadingOutputs={false}
        onReload={() => undefined}
        onSelectOutput={() => undefined}
        outputs={[]}
        outputsError={null}
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
        selectedOutput={baseOutput}
      />,
    );

    expect(markup).toContain("Current step");
    expect(markup).toContain("task-review-1");
    expect(markup).toContain("Code review");
    expect(markup).toContain("Fix notes");
  });

  it("marks the selected output item in the list", () => {
    const markup = renderToStaticMarkup(
      <MissionOutputBrowser
        currentStep="review"
        isLoadingOutputs={false}
        onReload={() => undefined}
        onSelectOutput={() => undefined}
        outputs={[baseOutput]}
        outputsError={null}
        selectedOutput={baseOutput}
      />,
    );

    expect(markup).toContain("Code review");
    expect(markup).toContain("task-review-1");
  });

  it("renders Lunafreya facet snapshot badges when output metadata is present", () => {
    const markup = renderToStaticMarkup(
      <MissionOutputBrowser
        currentStep="review"
        isLoadingOutputs={false}
        onReload={() => undefined}
        onSelectOutput={() => undefined}
        outputs={[
          {
            ...baseOutput,
            metadata: {
              capturedAt: "2026-04-11T00:00:00.000Z",
              lunafreyaFacetSnapshot: {
                selectedJobId: "oracle",
                selectedJobLabel: "Oracle",
                selectedKnowledgeIds: ["hydraean"],
                selectedKnowledgeLabels: ["Hydraean Records"],
                updatedAt: "2026-04-11T00:00:00.000Z",
              },
            },
          },
        ]}
        outputsError={null}
        selectedOutput={baseOutput}
      />,
    );

    expect(markup).toContain("Job: Oracle");
    expect(markup).toContain("Hydraean Records");
  });
});
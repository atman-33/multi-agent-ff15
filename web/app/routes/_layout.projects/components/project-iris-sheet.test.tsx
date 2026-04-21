import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectIrisSheet } from "./project-iris-sheet";

vi.mock("@/components/operations/iris-authoring-sheet", () => ({
  IrisAuthoringSheet: ({
    composerHelperText,
    composerPlaceholder,
    conversationSummary,
    description,
    emptyDescription,
    emptyTitle,
    error,
    isComposerDisabled,
  }: {
    composerHelperText?: string | null;
    composerPlaceholder?: string;
    conversationSummary: string;
    description?: string;
    emptyDescription?: string;
    emptyTitle?: string;
    error?: string | null;
    isComposerDisabled?: boolean;
  }) => (
    <div data-project-iris-sheet="true">
      <div>{composerHelperText}</div>
      <div>{composerPlaceholder}</div>
      <div>{conversationSummary}</div>
      <div>{description}</div>
      <div>{emptyTitle}</div>
      <div>{emptyDescription}</div>
      <div>{error}</div>
      <div>{isComposerDisabled ? "disabled" : "enabled"}</div>
    </div>
  ),
}));

describe("project-iris-sheet", () => {
  it("shows manual refresh guidance while the pinned skill is available", () => {
    const markup = renderToStaticMarkup(
      <ProjectIrisSheet
        error={null}
        isLoading={false}
        isOpen={true}
        isSending={false}
        onClose={() => undefined}
        onNewSession={() => undefined}
        onSelectedModelChange={() => undefined}
        onSend={() => Promise.resolve()}
        renderSnapshot={null}
        selectedModel={null}
        sessionId={null}
        sessionStatus={null}
        skillAvailable={true}
        skillError={null}
      />,
    );

    expect(markup).toContain("Refresh the Projects page manually after Iris completes a registry change.");
    expect(markup).toContain("Ask Iris to register, rename, refresh, or delete a project");
    expect(markup).toContain("Single shared conversation");
    expect(markup).toContain("enabled");
  });

  it("disables the composer and surfaces the missing-skill message when project-manage is unavailable", () => {
    const markup = renderToStaticMarkup(
      <ProjectIrisSheet
        error="Pinned project-manage skill is unavailable."
        isLoading={false}
        isOpen={true}
        isSending={false}
        onClose={() => undefined}
        onNewSession={() => undefined}
        onSelectedModelChange={() => undefined}
        onSend={() => Promise.resolve()}
        renderSnapshot={null}
        selectedModel={null}
        sessionId="session-project-iris-1"
        sessionStatus="idle"
        skillAvailable={false}
        skillError="Pinned project-manage skill is unavailable."
      />,
    );

    expect(markup).toContain("Pinned project-manage skill is unavailable.");
    expect(markup).toContain("Restorable single shared conversation");
    expect(markup).toContain("disabled");
  });
});
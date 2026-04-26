import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OperationsDraftRecord } from "@/lib/operations/draft-store";
import { OperationListPane } from "./operation-list-pane";

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function createDraft(): OperationsDraftRecord {
  return {
    id: "draft-restored",
    sourceOperationRef: "builtin:ja:noctis-autonomous.yaml",
    scope: "noctis_team",
    targetValue: "builtin",
    updatedAt: "2026-04-16T00:00:00.000Z",
    operation: {
      sourcePath: "/tmp/draft.yaml",
      name: "restored-draft",
      description: "Restored draft operation",
      initial_step: "plan",
      jobs: {},
      instructions: {},
      skills: {},
      policies: {},
      steps: [
        {
          name: "plan",
          agent: "noctis",
          instruction: { inline: "Plan the revision." },
          rules: [],
        },
      ],
    },
  };
}

describe("operation-list-pane", () => {
  it("renders restored drafts in the dedicated Draft section above saved operations", () => {
    const markup = renderToStaticMarkup(
      <OperationListPane
        drafts={[createDraft()]}
        onCreateBlankDraft={() => undefined}
        onSelectDraft={() => undefined}
        onSelectOperation={() => undefined}
        operations={[
          {
            description: "Default conversational flow.",
            isDefault: true,
            label: "Default (Autonomous)",
            name: "noctis-autonomous",
            sourceKind: "builtin",
            sourceLabel: "Builtin",
            value: "builtin:ja:noctis-autonomous.yaml",
          },
        ]}
        selectedDraftId="draft-restored"
        selectedOperation="builtin:ja:noctis-autonomous.yaml"
      />,
    );

    expect(markup).toContain("Draft");
    expect(markup).toContain("restored-draft");
    expect(markup).toContain("Saved revision");
    expect(markup).toContain("Saved Operations");
  });
});
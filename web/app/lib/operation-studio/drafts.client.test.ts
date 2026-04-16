import { describe, expect, it } from "vitest";
import type { OperationDefinition } from "@/lib/operation-definition/types";
import {
  loadOperationStudioDrafts,
  replaceOperationStudioDraft,
  STORAGE_KEY,
  type OperationStudioDraftRecord,
} from "./draft-store";

function createDraft(overrides: Partial<OperationStudioDraftRecord> = {}): OperationStudioDraftRecord {
  return {
    id: overrides.id ?? "draft-1",
    sourceOperationRef: overrides.sourceOperationRef ?? "builtin:ja:noctis-autonomous.yaml",
    scope: overrides.scope ?? "noctis_team",
    targetValue: overrides.targetValue ?? "builtin",
    updatedAt: overrides.updatedAt ?? "2026-04-16T00:00:00.000Z",
    operation: (overrides.operation ?? {
      sourcePath: "/tmp/draft.yaml",
      name: "draft-flow",
      description: "Draft flow",
      initial_step: "plan",
      jobs: {},
      instructions: {},
      skills: {},
      policies: {},
      steps: [
        {
          name: "plan",
          agent: "noctis",
          instruction: { inline: "Plan the draft." },
          rules: [],
        },
      ],
    }) as OperationDefinition,
  };
}

describe("drafts.client", () => {
  it("restores valid persisted drafts from storage", () => {
    const storage = {
      getItem: (key: string) =>
        key === STORAGE_KEY
          ? JSON.stringify([createDraft({ id: "draft-restored" })])
          : null,
    };

    const drafts = loadOperationStudioDrafts(storage);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.id).toBe("draft-restored");
  });

  it("drops invalid persisted payloads instead of throwing", () => {
    const storage = {
      getItem: () => "{not-json",
    };

    expect(loadOperationStudioDrafts(storage)).toEqual([]);
  });

  it("keeps one draft slot per saved source candidate", () => {
    const current = [createDraft({ id: "draft-old" })];

    const next = replaceOperationStudioDraft(
      current,
      createDraft({
        id: "draft-new",
        updatedAt: "2026-04-16T01:00:00.000Z",
        operation: {
          ...createDraft().operation,
          name: "draft-flow-v2",
        },
      }),
    );

    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe("draft-new");
    expect(next[0]?.operation.name).toBe("draft-flow-v2");
  });

  it("keeps independent drafts for different sources", () => {
    const current = [createDraft({ id: "draft-old" })];

    const next = replaceOperationStudioDraft(
      current,
      createDraft({
        id: "draft-project",
        sourceOperationRef: "project:alpha:repo-review.yaml",
        targetValue: "project:alpha",
      }),
    );

    expect(next).toHaveLength(2);
    expect(next.map((draft) => draft.id)).toEqual(["draft-project", "draft-old"]);
  });
});
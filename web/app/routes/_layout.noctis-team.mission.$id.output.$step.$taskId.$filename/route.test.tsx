import { describe, expect, it, vi } from "vitest";
import {
  buildMissionOutputRequestPath,
  loadMissionOutputDocument,
} from "@/lib/mission-output-detail";

describe("noctis-team mission output detail route", () => {
  it("builds the selected mission output request path", () => {
    expect(
      buildMissionOutputRequestPath({
        filename: "news-run-plan.md",
        missionId: "mission-123",
        step: "prepare-run",
        taskId: "step_prepare-run_1",
      }),
    ).toBe(
      "/api/missions/mission-123/output?file=news-run-plan.md&step=prepare-run&taskId=step_prepare-run_1",
    );
  });

  it("loads and normalizes the selected mission output document", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        author: "Noctis",
        content: "# Plan\n\nDetails.",
        date: "2026-04-09T00:00:00.000Z",
        displayMode: "markdown",
        filePath: "/tmp/news-run-plan.md",
        filename: "news-run-plan.md",
        frontmatter: null,
        metadata: null,
        rawContent: "# Plan\n\nDetails.",
        step: "prepare-run",
        tags: [],
        taskId: "step_prepare-run_1",
        title: "News run plan",
      }),
      ok: true,
      status: 200,
    });

    const document = await loadMissionOutputDocument({
      fetchImpl: fetchMock as typeof fetch,
      loaderData: {
        filename: "news-run-plan.md",
        missionId: "mission-123",
        step: "prepare-run",
        taskId: "step_prepare-run_1",
      },
      signal: new AbortController().signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/missions/mission-123/output?file=news-run-plan.md&step=prepare-run&taskId=step_prepare-run_1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(document).toMatchObject({
      author: "Noctis",
      content: "# Plan\n\nDetails.",
      loading: false,
      title: "News run plan",
    });
  });
});
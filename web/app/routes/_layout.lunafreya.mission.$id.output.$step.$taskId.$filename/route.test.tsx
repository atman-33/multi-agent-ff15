import { describe, expect, it, vi } from "vitest";
import {
  buildMissionOutputRequestPath,
  loadMissionOutputDocument,
} from "@/lib/mission-output-detail";

describe("lunafreya mission output detail route", () => {
  it("builds the selected mission output request path", () => {
    expect(
      buildMissionOutputRequestPath({
        filename: "research-brief.md",
        missionId: "mission-luna",
        step: "research",
        taskId: "step_research_1",
      }),
    ).toBe(
      "/api/missions/mission-luna/output?file=research-brief.md&step=research&taskId=step_research_1",
    );
  });

  it("loads and normalizes the selected mission output document", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        author: "Lunafreya",
        content: "# Research brief\n\nSignal.",
        date: "2026-04-09T00:00:00.000Z",
        displayMode: "markdown",
        filePath: "/tmp/research-brief.md",
        filename: "research-brief.md",
        frontmatter: null,
        metadata: {
          capturedAt: "2026-04-09T00:00:01.000Z",
          lunafreyaFacetSnapshot: {
            selectedJobId: "job:research",
            selectedJobLabel: "Research",
            selectedSkillLabels: ["Competitive Scan"],
          },
        },
        rawContent: "# Research brief\n\nSignal.",
        step: "research",
        tags: [],
        taskId: "step_research_1",
        title: "Research brief",
      }),
      ok: true,
      status: 200,
    });

    const document = await loadMissionOutputDocument({
      fetchImpl: fetchMock as typeof fetch,
      loaderData: {
        filename: "research-brief.md",
        missionId: "mission-luna",
        step: "research",
        taskId: "step_research_1",
      },
      signal: new AbortController().signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/missions/mission-luna/output?file=research-brief.md&step=research&taskId=step_research_1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(document).toMatchObject({
      author: "Lunafreya",
      content: "# Research brief\n\nSignal.",
      loading: false,
      title: "Research brief",
    });
  });
});
// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock, previewSpy } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  previewSpy: vi.fn(),
}));

vi.mock("@/components/markdown-document-sheet-preview", () => ({
  MarkdownDocumentSheetPreview: (props: Record<string, unknown>) => {
    previewSpy(props);
    return <section>{props.loading ? "loading" : String(props.title ?? "")}</section>;
  },
}));

vi.mock("@/components/ui/sheet", () => ({
  SheetClose: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

import { LunafreyaMissionOutputDetailRoute } from "./route";

const TestRoute = LunafreyaMissionOutputDetailRoute as unknown as (props: {
  loaderData: {
    filename: string;
    missionId: string;
    step: string;
    taskId: string;
  };
}) => ReactNode;

let container: HTMLDivElement;
let root: Root | null;

async function renderRoute(loaderData: {
  filename: string;
  missionId: string;
  step: string;
  taskId: string;
}) {
  root = createRoot(container);
  await act(async () => {
    root?.render(<TestRoute loaderData={loaderData} />);
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
  fetchMock.mockReset();
  previewSpy.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  container.remove();
  vi.unstubAllGlobals();
});

describe("lunafreya mission output detail route", () => {
  it("loads the selected mission output after the detail route mounts", async () => {
    let resolveResponse: ((value: { json: () => Promise<Record<string, unknown>>; ok: boolean; status: number }) => void) | null = null;

    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveResponse = resolve;
        }),
    );

    await renderRoute({
      filename: "research-brief.md",
      missionId: "mission-luna",
      step: "research",
      taskId: "step_research_1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/missions/mission-luna/output?step=research&taskId=step_research_1&file=research-brief.md",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(previewSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      loading: true,
      previewLabel: "Mission output",
      title: "research-brief.md",
    });

    await act(async () => {
      resolveResponse?.({
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
      await Promise.resolve();
    });

    expect(previewSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      author: "Lunafreya",
      content: "# Research brief\n\nSignal.",
      loading: false,
      title: "Research brief",
    });
  });
});
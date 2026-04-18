import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { MarkdownDocumentSheetPreview } from "@/components/markdown-document-sheet-preview";
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
import { getLunafreyaJobDisplayLabel } from "@/lib/lunafreya-prompt-context";
import type { MissionOutputMetadata } from "@/lib/types/mission";
import type { Route } from "./+types/route";

type LoaderData = {
  filename: string;
  missionId: string;
  step: string;
  taskId: string;
};

type OutputDocumentState = {
  author: string;
  content: string;
  date: string;
  displayMode: "markdown" | "metadata-only" | "empty";
  error: string | null;
  filePath: string;
  frontmatter: Record<string, unknown> | null;
  metadata?: MissionOutputMetadata | null;
  loading: boolean;
  rawContent: string;
  tags: string[];
  title: string;
};

type OutputRouteResponse = Partial<
  Omit<OutputDocumentState, "error" | "loading"> & { error?: string | null }
>;

function createOutputDocumentState(
  filename: string,
  overrides: Partial<OutputDocumentState> = {},
): OutputDocumentState {
  return {
    author: "",
    content: "",
    date: "",
    displayMode: "empty",
    error: null,
    filePath: "",
    frontmatter: null,
    loading: false,
    metadata: null,
    rawContent: "",
    tags: [],
    title: filename || "Mission output",
    ...overrides,
  };
}

function buildMissionOutputRequestPath(loaderData: LoaderData): string {
  const query = new URLSearchParams({
    file: loaderData.filename,
    step: loaderData.step,
    taskId: loaderData.taskId,
  });

  return `/api/missions/${encodeURIComponent(loaderData.missionId)}/output?${query.toString()}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export const loader = ({ params }: Route.LoaderArgs): LoaderData => ({
  filename: params.filename ?? "",
  missionId: params.id ?? "",
  step: params.step ?? "",
  taskId: params.taskId ?? "",
});

export const LunafreyaMissionOutputDetailRoute = ({ loaderData }: Route.ComponentProps) => {
  const [document, setDocument] = useState<OutputDocumentState>(() =>
    createOutputDocumentState(loaderData.filename, {
      loading: Boolean(
        loaderData.missionId && loaderData.step && loaderData.taskId && loaderData.filename,
      ),
    }),
  );

  useEffect(() => {
    if (!loaderData.missionId || !loaderData.step || !loaderData.taskId || !loaderData.filename) {
      setDocument(
        createOutputDocumentState(loaderData.filename, {
          error: "Missing output route parameters",
        }),
      );
      return;
    }

    const abortController = new AbortController();

    setDocument(
      createOutputDocumentState(loaderData.filename, {
        loading: true,
      }),
    );

    void (async () => {
      try {
        const response = await fetch(buildMissionOutputRequestPath(loaderData), {
          signal: abortController.signal,
        });
        const data = (await response.json().catch(() => ({}))) as OutputRouteResponse;

        if (!response.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : `Unable to load output (${response.status})`,
          );
        }

        setDocument(
          createOutputDocumentState(loaderData.filename, {
            author: typeof data.author === "string" ? data.author : "",
            content: typeof data.content === "string" ? data.content : "",
            date: typeof data.date === "string" ? data.date : "",
            displayMode:
              data.displayMode === "markdown" ||
              data.displayMode === "metadata-only" ||
              data.displayMode === "empty"
                ? data.displayMode
                : "empty",
            filePath: typeof data.filePath === "string" ? data.filePath : "",
            frontmatter:
              data.frontmatter && typeof data.frontmatter === "object" && !Array.isArray(data.frontmatter)
                ? data.frontmatter
                : null,
            loading: false,
            metadata: data.metadata ?? null,
            rawContent: typeof data.rawContent === "string" ? data.rawContent : "",
            tags: Array.isArray(data.tags)
              ? data.tags.filter((tag): tag is string => typeof tag === "string")
              : [],
            title: typeof data.title === "string" && data.title.trim() ? data.title : loaderData.filename,
          }),
        );
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        setDocument(
          createOutputDocumentState(loaderData.filename, {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [loaderData]);

  return (
    <MarkdownDocumentSheetPreview
      author={document.author}
      content={document.content}
      date={document.date}
      displayMode={document.displayMode}
      error={document.error}
      filePath={document.filePath}
      frontmatter={document.frontmatter}
      headerActions={
        <SheetClose asChild>
          <Button className="h-8 w-8 shrink-0" size="icon" type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </SheetClose>
      }
      headerBadges={
        <>
          <span className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {loaderData.step}
          </span>
          <span className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {loaderData.taskId}
          </span>
          {document.metadata?.lunafreyaFacetSnapshot ? (
            <>
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] text-primary/90">
                Job: {getLunafreyaJobDisplayLabel(document.metadata.lunafreyaFacetSnapshot)}
              </span>
              {document.metadata.lunafreyaFacetSnapshot.selectedSkillLabels.map((label) => (
                <span
                  key={`${loaderData.taskId}:${label}`}
                  className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] text-foreground/80"
                >
                  {label}
                </span>
              ))}
            </>
          ) : null}
        </>
      }
      loading={document.loading}
      previewLabel="Mission output"
      title={document.title || loaderData.filename || "Mission output"}
    />
  );
};

export default LunafreyaMissionOutputDetailRoute;
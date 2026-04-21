import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { MarkdownDocumentSheetPreview } from "@/components/markdown-document-sheet-preview";
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
import { getLunafreyaJobDisplayLabel } from "@/lib/lunafreya-prompt-context";
import {
  createOutputDocumentState,
  isAbortError,
  loadMissionOutputDocument,
  type MissionOutputDocumentState,
  type MissionOutputLoaderData,
} from "@/lib/mission-output-detail";
import type { Route } from "./+types/route";

export const loader = ({ params }: Route.LoaderArgs): MissionOutputLoaderData => ({
  filename: params.filename ?? "",
  missionId: params.id ?? "",
  step: params.step ?? "",
  taskId: params.taskId ?? "",
});

export const NoctisTeamMissionOutputDetailRoute = ({ loaderData }: Route.ComponentProps) => {
  const [document, setDocument] = useState<MissionOutputDocumentState>(() =>
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

    void loadMissionOutputDocument({
      loaderData,
      signal: abortController.signal,
    })
      .then((nextDocument) => {
        setDocument(nextDocument);
      })
      .catch((error) => {
        if (isAbortError(error)) {
          return;
        }

        setDocument(
          createOutputDocumentState(loaderData.filename, {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });

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

export default NoctisTeamMissionOutputDetailRoute;
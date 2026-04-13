import { X } from "lucide-react";
import { useNavigate } from "react-router";
import { MarkdownDocumentSheetPreview } from "@/components/markdown-document-sheet-preview";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent } from "@/components/ui/sheet";
import { getLunafreyaJobDisplayLabel } from "@/lib/lunafreya-prompt-context";
import { readMissionOutputDocument } from "@/lib/mission-output-metadata.server";
import { buildMissionPath } from "../_layout.noctis-team/components/output-detail-routing";
import type { Route } from "./+types/route";

type LoaderData = {
  author: string;
  content: string;
  date: string;
  displayMode: "markdown" | "metadata-only" | "empty";
  error: string | null;
  filePath: string;
  filename: string;
  frontmatter: Record<string, unknown> | null;
  metadata?: {
    lunafreyaFacetSnapshot?: {
      selectedJobId?: string;
      selectedJobLabel?: string | null;
      selectedKnowledgeLabels: string[];
    };
  } | null;
  missionId: string;
  rawContent: string;
  step: string;
  tags: string[];
  taskId: string;
  title: string;
};

export const loader = ({ params }: Route.LoaderArgs): LoaderData => {
  const missionId = params.id ?? "";
  const step = params.step ?? "";
  const taskId = params.taskId ?? "";
  const filename = params.filename ?? "";

  if (!missionId || !step || !taskId || !filename) {
    return {
      author: "",
      content: "",
      date: "",
      displayMode: "empty",
      error: "Missing output route parameters",
      filePath: "",
      filename,
      frontmatter: null,
      missionId,
      rawContent: "",
      step,
      tags: [],
      taskId,
      title: filename || "Mission output",
    };
  }

  try {
    const document = readMissionOutputDocument({ missionId, step, taskId, filename });
    if (!document) {
      return {
        author: "",
        content: "",
        date: "",
        displayMode: "empty",
        error: `File not found: ${filename}`,
        filePath: "",
        filename,
        frontmatter: null,
        missionId,
        rawContent: "",
        step,
        tags: [],
        taskId,
        title: filename,
      };
    }

    return {
      ...document,
      error: null,
      missionId,
    };
  } catch (error) {
    return {
      author: "",
      content: "",
      date: "",
      displayMode: "empty",
      error: error instanceof Error ? error.message : String(error),
      filePath: "",
      filename,
      frontmatter: null,
      missionId,
      rawContent: "",
      step,
      tags: [],
      taskId,
      title: filename || "Mission output",
    };
  }
};

export const NoctisTeamMissionOutputDetailRoute = ({ loaderData }: Route.ComponentProps) => {
  const navigate = useNavigate();

  return (
    <Sheet open onOpenChange={(open) => (!open ? navigate(buildMissionPath(loaderData.missionId)) : undefined)}>
      <SheetContent
        className="w-[98vw] max-w-[98vw] p-0 sm:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl"
        showCloseButton={false}
      >
        <MarkdownDocumentSheetPreview
          author={loaderData.author}
          content={loaderData.content}
          date={loaderData.date}
          displayMode={loaderData.displayMode}
          error={loaderData.error}
          filePath={loaderData.filePath}
          frontmatter={loaderData.frontmatter}
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
              {loaderData.metadata?.lunafreyaFacetSnapshot ? (
                <>
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] text-primary/90">
                    Job: {getLunafreyaJobDisplayLabel(loaderData.metadata.lunafreyaFacetSnapshot)}
                  </span>
                  {loaderData.metadata.lunafreyaFacetSnapshot.selectedKnowledgeLabels.map((label) => (
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
          previewLabel="Mission output"
          title={loaderData.title || loaderData.filename || "Mission output"}
        />
      </SheetContent>
    </Sheet>
  );
};

export default NoctisTeamMissionOutputDetailRoute;
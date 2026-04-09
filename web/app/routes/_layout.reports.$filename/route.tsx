import { Archive, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams, useSearchParams } from "react-router";
import { MarkdownDocumentSheetPreview } from "@/components/markdown-document-sheet-preview";
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
import type {
  MarkdownDocumentDisplayMode,
  MarkdownDocumentFrontmatter,
} from "@/lib/types/markdown-document";
import type { Route } from "./+types/route";

interface ReportsOutletContext {
  archiveReport: (filename: string, action: "archive" | "restore") => Promise<void>;
}

type ReportResponse = {
  author?: string;
  content?: string;
  date?: string;
  displayMode?: MarkdownDocumentDisplayMode;
  error?: string;
  filePath?: string;
  frontmatter?: MarkdownDocumentFrontmatter | null;
  rawContent?: string;
  tags?: string[];
  title?: string;
};

const ReportDetail = (_props: Route.ComponentProps) => {
  const { filename } = useParams<{ filename: string }>();
  const [searchParams] = useSearchParams();
  const isArchived = searchParams.get("archived") === "true";
  const navigate = useNavigate();
  const { archiveReport } = useOutletContext<ReportsOutletContext>();

  const [content, setContent] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [author, setAuthor] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [displayMode, setDisplayMode] = useState<MarkdownDocumentDisplayMode>("empty");
  const [frontmatter, setFrontmatter] = useState<MarkdownDocumentFrontmatter | null>(null);
  const [reportFilePath, setReportFilePath] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = useCallback(async () => {
    if (!filename) {
      return;
    }

    setLoading(true);
    setContent("");
    setDisplayMode("empty");
    setFrontmatter(null);
    setReportFilePath("");
    setError(null);
    try {
      const archivedParam = isArchived ? "&archived=true" : "";
      const res = await fetch(`/api/report?file=${encodeURIComponent(filename)}${archivedParam}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as ReportResponse;
      if (data.error) {
        throw new Error(data.error);
      }
      setContent(data.content || "");
      setTitle(data.title || filename);
      setAuthor(data.author || "");
      setDate(data.date || "");
      setDisplayMode(data.displayMode || (data.content ? "markdown" : "empty"));
      setFrontmatter(data.frontmatter ?? null);
      setReportFilePath(typeof data.filePath === "string" ? data.filePath : "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filename, isArchived]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const handleArchiveAction = async () => {
    if (!filename) {
      return;
    }
    setArchiving(true);
    try {
      await archiveReport(filename, isArchived ? "restore" : "archive");
      navigate("/reports");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <MarkdownDocumentSheetPreview
      author={author}
      content={content}
      date={date}
      displayMode={displayMode}
      error={error}
      filePath={reportFilePath}
      frontmatter={frontmatter}
      headerActions={
        <SheetClose asChild>
          <Button className="h-8 w-8 shrink-0" size="icon" type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </SheetClose>
      }
      headerBadges={
        isArchived ? (
          <span className="rounded bg-amber-500/10 px-2 py-0.5 font-medium text-amber-600 text-xs dark:text-amber-400">
            Archived
          </span>
        ) : null
      }
      loading={loading}
      previewLabel="Report preview"
      title={title || filename || "Report"}
      toolbarActions={
        <Button
          className="h-8 gap-1.5 text-xs"
          disabled={archiving}
          onClick={handleArchiveAction}
          size="sm"
          variant="outline"
        >
          {isArchived ? (
            <>
              <RotateCcw className="h-3.5 w-3.5" />
              Restore
            </>
          ) : (
            <>
              <Archive className="h-3.5 w-3.5" />
              Archive
            </>
          )}
        </Button>
      }
    />
  );
};

export default ReportDetail;

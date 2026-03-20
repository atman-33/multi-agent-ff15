import { Archive, Check, Clipboard, Clock, RefreshCw, RotateCcw, User, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate, useOutletContext, useParams, useSearchParams } from "react-router";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SheetClose, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface ReportsOutletContext {
  archiveReport: (filename: string, action: "archive" | "restore") => Promise<void>;
}

export default function ReportDetail() {
  const { filename } = useParams<{ filename: string }>();
  const [searchParams] = useSearchParams();
  const isArchived = searchParams.get("archived") === "true";
  const navigate = useNavigate();
  const { archiveReport } = useOutletContext<ReportsOutletContext>();

  const [content, setContent] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [author, setAuthor] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchContent = useCallback(async () => {
    if (!filename) {
      return;
    }
    setLoading(true);
    setContent("");
    try {
      const archivedParam = isArchived ? "&archived=true" : "";
      const res = await fetch(`/api/report?file=${encodeURIComponent(filename)}${archivedParam}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setContent(data.content || "");
      setTitle(data.title || filename);
      setAuthor(data.author || "");
      setDate(data.date || "");
    } catch (e) {
      setContent(`Failed to load content: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [filename, isArchived]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const handleCopy = async () => {
    if (!content) {
      return;
    }
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
    <div className="flex h-full min-h-0 flex-col">
      <SheetHeader className="shrink-0 border-border/50 border-b bg-background/50 px-5 py-4 text-left backdrop-blur-sm sm:px-6">
        <div className="flex items-start justify-between gap-4 pr-8">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
              <span className="rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 font-medium text-foreground">
                Report preview
              </span>
              {isArchived ? (
                <span className="rounded bg-amber-500/10 px-2 py-0.5 font-medium text-amber-600 text-xs dark:text-amber-400">
                  Archived
                </span>
              ) : null}
            </div>
            <SheetTitle className="truncate pr-2">{title || filename}</SheetTitle>
            <SheetDescription asChild>
              <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
                {author ? (
                  <span className="flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 font-medium text-primary">
                    <User className="h-3.5 w-3.5" />
                    {author}
                  </span>
                ) : null}
                {date ? (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(date).toLocaleString()}
                  </span>
                ) : null}
              </div>
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button className="h-8 w-8 shrink-0" size="icon" type="button" variant="ghost">
              <X className="h-4 w-4" />
            </Button>
          </SheetClose>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            className="h-8 gap-1.5 text-xs"
            disabled={loading || !content}
            onClick={handleCopy}
            size="sm"
            variant="outline"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-500" />
                Copied!
              </>
            ) : (
              <>
                <Clipboard className="h-3.5 w-3.5" />
                Copy
              </>
            )}
          </Button>
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
        </div>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
        {loading ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
            <span className="text-sm">Loading content...</span>
          </div>
        ) : (
          <Card className="mx-auto h-auto min-h-full max-w-4xl border-border/50 shadow-sm">
            <CardContent className="px-5 pt-6 pb-8 md:px-8">
              <div
                className={cn(
                  "markdown-body text-[13px] leading-6 md:text-sm md:leading-6",
                  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                )}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content || "*No content.*"}
                </ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

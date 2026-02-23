import { Clock, FileText, RefreshCw, User, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Alert,
  AlertCircle,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReportMeta } from "./api.reports";

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [selectedReport, setSelectedReport] = useState<ReportMeta | null>(null);
  const [content, setContent] = useState<string>("");
  const [loadingList, setLoadingList] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/reports");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setReports(data.reports || []);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const fetchContent = useCallback(async (filename: string) => {
    setLoadingContent(true);
    setContent("");
    try {
      const res = await fetch(
        `/api/report?file=${encodeURIComponent(filename)}`
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setContent(data.content || "");
    } catch (e) {
      console.error(e);
      setContent(`Failed to load content: ${e}`);
    } finally {
      setLoadingContent(false);
    }
  }, []);

  const handleSelect = (r: ReportMeta) => {
    setSelectedReport(r);
    fetchContent(r.filename);
  };

  return (
    <div className="relative flex h-full flex-col bg-background">
      {/* Sticky toolbar */}
      <div className="flex shrink-0 items-center justify-between border-border/50 border-b bg-card/40 px-5 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Reports</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
            {reports.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            aria-label="Reload reports"
            className="h-7 w-7"
            disabled={loadingList}
            onClick={fetchReports}
            size="icon"
            variant="ghost"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", loadingList && "animate-spin")}
            />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Master List */}
        <div
          className={cn(
            "shrink-0 flex-col overflow-auto border-border/50 border-r",
            selectedReport ? "hidden w-72 md:flex lg:w-80" : "flex w-full"
          )}
        >
          {error && (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          )}
          {!error && reports.length === 0 && !loadingList && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No reports found in docs/reports/
            </div>
          )}

          <div className="flex flex-col">
            {reports.map((r) => (
              <button
                className={cn(
                  "flex flex-col gap-1 border-border/50 border-b p-4 text-left transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none",
                  selectedReport?.filename === r.filename && "bg-muted"
                )}
                key={r.filename}
                onClick={() => handleSelect(r)}
                type="button"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="line-clamp-2 font-medium text-foreground text-sm leading-tight">
                    {r.title}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
                    <User className="h-3 w-3" />
                    <span className="max-w-[80px] truncate font-medium">
                      {r.author}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(r.date).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {r.tags && r.tags.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {r.tags.map((tag) => (
                      <span
                        className="rounded border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        key={tag}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Detail View */}
        <div
          className={cn(
            "relative flex-1 flex-col overflow-hidden bg-muted/20",
            selectedReport ? "flex" : "hidden md:flex"
          )}
        >
          {selectedReport ? (
            <div className="absolute inset-0 flex h-full flex-col">
              <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-border/50 border-b bg-background/50 px-6 py-4 backdrop-blur-sm">
                <div className="mr-4 min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-lg">
                    {selectedReport.title}
                  </h3>
                  <div className="mt-1.5 flex items-center gap-3 text-muted-foreground text-xs">
                    <span className="flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 font-medium text-primary">
                      <User className="h-3.5 w-3.5" />
                      {selectedReport.author}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(selectedReport.date).toLocaleString()}
                    </span>
                  </div>
                </div>
                {/* Mobile close button to go back to list */}
                <Button
                  className="shrink-0 md:hidden"
                  onClick={() => setSelectedReport(null)}
                  size="icon"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex-1 overflow-auto p-4 md:p-8">
                {loadingContent ? (
                  <div className="flex h-48 items-center justify-center text-muted-foreground">
                    <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                    <span className="text-sm">Loading content...</span>
                  </div>
                ) : (
                  <Card className="mx-auto h-auto min-h-full max-w-4xl border-border/50 shadow-sm">
                    <CardContent className="px-5 pt-6 pb-8 md:px-10">
                      <div className="markdown-body text-sm md:text-base">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {content || "*No content.*"}
                        </ReactMarkdown>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          ) : (
            <div className="fade-in flex h-full w-full animate-in flex-col items-center justify-center text-muted-foreground/60 duration-500">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
                <FileText className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <p className="font-medium text-sm">No report selected</p>
              <p className="mt-1 text-muted-foreground/50 text-xs">
                Choose a report from the sidebar to view its details
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

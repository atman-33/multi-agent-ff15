import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Clock, RefreshCw, X, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle, AlertCircle } from "@/components/ui/alert";
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
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
      const res = await fetch(`/api/report?file=${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
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
    <div className="flex flex-col h-full bg-background relative">
      {/* Sticky toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 bg-card/40 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Reports</h2>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {reports.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={fetchReports}
            disabled={loadingList}
            aria-label="Reload reports"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loadingList && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Master List */}
        <div
          className={cn(
            "flex-col shrink-0 border-r border-border/50 overflow-auto",
            selectedReport ? "hidden md:flex w-72 lg:w-80" : "flex w-full"
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
            <div className="p-8 text-center text-sm text-muted-foreground">
              No reports found in docs/reports/
            </div>
          )}

          <div className="flex flex-col">
            {reports.map((r) => (
              <button
                key={r.filename}
                onClick={() => handleSelect(r)}
                className={cn(
                  "flex flex-col gap-1 p-4 border-b border-border/50 text-left transition-colors hover:bg-muted/50 focus:outline-none focus:bg-muted/50",
                  selectedReport?.filename === r.filename && "bg-muted"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm leading-tight text-foreground line-clamp-2">
                    {r.title}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span className="truncate max-w-[80px] font-medium">{r.author}</span>
                  </span>
                  <span className="flex items-center gap-1 shrink-0 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(r.date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {r.tags && r.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2.5">
                    {r.tags.map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 bg-background border border-border/60 rounded text-[10px] text-muted-foreground font-mono">
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
            "flex-1 flex-col overflow-hidden bg-muted/20 relative",
            !selectedReport ? "hidden md:flex" : "flex"
          )}
        >
          {selectedReport ? (
            <div className="flex flex-col h-full absolute inset-0">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 shrink-0 bg-background/50 backdrop-blur-sm z-10 sticky top-0">
                <div className="flex-1 min-w-0 mr-4">
                  <h3 className="font-semibold text-lg truncate">
                    {selectedReport.title}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5">
                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded flex items-center gap-1 font-medium">
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
                  variant="ghost"
                  size="icon"
                  className="md:hidden shrink-0"
                  onClick={() => setSelectedReport(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex-1 overflow-auto p-4 md:p-8">
                {loadingContent ? (
                  <div className="flex items-center justify-center h-48 text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                    <span className="text-sm">Loading content...</span>
                  </div>
                ) : (
                  <Card className="border-border/50 shadow-sm max-w-4xl mx-auto h-auto min-h-full">
                    <CardContent className="pt-6 pb-8 px-5 md:px-10">
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
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 w-full animate-in fade-in duration-500">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                <FileText className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium">No report selected</p>
              <p className="text-xs mt-1 text-muted-foreground/50">Choose a report from the sidebar to view its details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

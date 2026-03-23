import { Archive, Clock, FileText, RefreshCw, RotateCcw, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { Alert, AlertCircle, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { ReportMeta } from "../api.reports";
import type { Route } from "./+types/route";

type Tab = "active" | "archived";

const SHEET_CLOSE_ANIMATION_MS = 300;

const ReportsLayout = (_props: Route.ComponentProps) => {
  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [tab, setTab] = useState<Tab>("active");
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const closeTimeoutRef = useRef<number | null>(null);

  const isDetailShowing = location.pathname !== "/reports" && location.pathname !== "/reports/";

  useEffect(() => {
    if (isDetailShowing) {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }

      setIsSheetOpen(true);
    }
  }, [isDetailShowing]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const fetchReports = useCallback(async (currentTab: Tab) => {
    setLoadingList(true);
    try {
      const url = currentTab === "archived" ? "/api/reports?archived=true" : "/api/reports";
      const res = await fetch(url);
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
    fetchReports(tab);
  }, [fetchReports, tab]);

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    navigate("/reports");
  };

  const handleSelect = (report: ReportMeta) => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    setIsSheetOpen(true);

    if (tab === "archived") {
      navigate(`/reports/${encodeURIComponent(report.filename)}?archived=true`);
      return;
    }

    navigate(`/reports/${encodeURIComponent(report.filename)}`);
  };

  const closeDetail = useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
    }

    setIsSheetOpen(false);
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      navigate("/reports");
    }, SHEET_CLOSE_ANIMATION_MS);
  }, [navigate]);

  const archiveReport = useCallback(
    async (filename: string, action: "archive" | "restore") => {
      try {
        const res = await fetch("/api/report-archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename, action }),
        });
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error);
        }
        await fetchReports(tab);
      } catch (e) {
        console.error("Archive action failed:", e);
      }
    },
    [fetchReports, tab]
  );

  return (
    <div className="relative flex h-full flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-border/50 border-b bg-card/40 px-5 py-3 backdrop-blur-xs">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Library</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
            {reports.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            aria-label="Reload reports"
            className="h-7 w-7"
            disabled={loadingList}
            onClick={() => fetchReports(tab)}
            size="icon"
            variant="ghost"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loadingList && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-full flex-col overflow-auto">
          <div className="sticky top-0 z-10 border-border/50 border-b bg-card/40 backdrop-blur-xs">
            <div className="flex">
              <button
                className={cn(
                  "flex-1 border-b-2 py-2 font-medium text-xs transition-colors",
                  tab === "active"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                onClick={() => handleTabChange("active")}
                type="button"
              >
                Active
              </button>
              <button
                className={cn(
                  "flex-1 border-b-2 py-2 font-medium text-xs transition-colors",
                  tab === "archived"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                onClick={() => handleTabChange("archived")}
                type="button"
              >
                Archived
              </button>
            </div>
          </div>

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
              {tab === "archived" ? "No archived reports." : "No reports found in docs/reports/"}
            </div>
          )}

          <div className="flex flex-col">
            {reports.map((report) => {
              const isActive =
                decodeURIComponent(location.pathname) === `/reports/${report.filename}`;
              return (
                <button
                  className={cn(
                    "group flex flex-col gap-1 border-border/50 border-b p-4 text-left transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-hidden",
                    isActive && "bg-muted"
                  )}
                  key={report.filename}
                  onClick={() => handleSelect(report)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 font-medium text-foreground text-sm leading-tight">
                      {report.title}
                    </span>
                    <button
                      className="ml-1 shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                      onClick={async (event) => {
                        event.stopPropagation();
                        const archiveAction = tab === "archived" ? "restore" : "archive";
                        await archiveReport(report.filename, archiveAction);
                        if (isActive) {
                          navigate("/reports");
                        }
                      }}
                      title={tab === "archived" ? "Restore" : "Archive"}
                      type="button"
                    >
                      {tab === "archived" ? (
                        <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
                      <User className="h-3 w-3" />
                      <span className="max-w-20 truncate font-medium">{report.author}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(report.date).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {report.tags && report.tags.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {report.tags.map((tag) => (
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
              );
            })}
          </div>
        </div>

        <Sheet
          onOpenChange={(open) => (!open ? closeDetail() : setIsSheetOpen(true))}
          open={isSheetOpen}
        >
          <SheetContent
            className="w-[98vw] max-w-[98vw] p-0 sm:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl"
            showCloseButton={false}
          >
            <Outlet context={{ archiveReport }} />
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
};

export default ReportsLayout;

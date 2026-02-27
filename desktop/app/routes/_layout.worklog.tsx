import { invoke } from "@tauri-apps/api/core";
import {
  Activity,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface WorklogEntry {
  agent: string;
  description?: string;
  status?: string;
  summary?: string;
  taskId: string;
  timestamp: string;
}

interface WorklogData {
  inProgress: WorklogEntry[];
  results: WorklogEntry[];
}

export default function WorklogPage() {
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const [data, setData] = useState<WorklogData>({
    inProgress: [],
    results: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (isTauri) {
        const result = await invoke<WorklogData>("read_worklog");
        setData(result);
      } else {
        const res = await fetch("/api/worklog");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        if (json.error) {
          throw new Error(json.error);
        }
        setData(json);
      }
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [isTauri]);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="flex h-full flex-col">
      {/* Sticky toolbar */}
      <div className="flex shrink-0 items-center justify-between border-border/50 border-b bg-card/40 px-5 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <h2 className="font-semibold text-sm">Worklog</h2>
          {data.inProgress.length > 0 && (
            <Badge
              className="h-5 min-w-[20px] justify-center px-1.5 py-0 text-[10px]"
              variant="default"
            >
              {data.inProgress.length} active
            </Badge>
          )}
        </div>
        <Button
          aria-label="Refresh worklog"
          className="h-7 w-7"
          disabled={loading}
          onClick={fetchData}
          size="icon"
          variant="ghost"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* In Progress */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-3.5 w-3.5 text-blue-500" />
              In Progress
            </CardTitle>
            <CardDescription className="text-xs">
              Tasks currently being worked on by Comrades
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.inProgress.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 opacity-20" />
                <p className="text-xs">No tasks in progress</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.inProgress.map((entry) => (
                  <div
                    className="flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3"
                    key={`${entry.taskId}-${entry.agent}`}
                  >
                    <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground text-xs capitalize">
                          {entry.agent}
                        </span>
                        {entry.taskId && (
                          <Badge
                            className="h-4 px-1.5 py-0 text-[10px]"
                            variant="outline"
                          >
                            {entry.taskId}
                          </Badge>
                        )}
                      </div>
                      {entry.description && (
                        <p className="mt-1 text-foreground/80 text-xs leading-relaxed">
                          {entry.description}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground/60">
                        <Clock className="h-2.5 w-2.5" />
                        {entry.timestamp}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Results */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              Today's Results
            </CardTitle>
            <CardDescription className="text-xs">
              Completed tasks and their outcomes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.results.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
                <CheckCircle2 className="h-6 w-6 opacity-20" />
                <p className="text-xs">No results yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.results.map((entry) => (
                  <div
                    className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
                      entry.status === "done"
                        ? "border-green-500/20 bg-green-500/5"
                        : "border-red-500/20 bg-red-500/5"
                    }`}
                    key={`${entry.taskId}-${entry.agent}-${entry.timestamp}`}
                  >
                    {entry.status === "done" ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
                    ) : (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground text-xs capitalize">
                          {entry.agent}
                        </span>
                        {entry.taskId && (
                          <Badge
                            className="h-4 px-1.5 py-0 text-[10px]"
                            variant="outline"
                          >
                            {entry.taskId}
                          </Badge>
                        )}
                        <Badge
                          className="h-4 px-1.5 py-0 text-[10px]"
                          variant={
                            entry.status === "done" ? "default" : "destructive"
                          }
                        >
                          {entry.status}
                        </Badge>
                      </div>
                      {entry.summary && (
                        <p className="mt-1 text-foreground/80 text-xs leading-relaxed">
                          {entry.summary}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground/60">
                        <Clock className="h-2.5 w-2.5" />
                        {entry.timestamp}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

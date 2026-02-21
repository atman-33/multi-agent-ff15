import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { RefreshCw, Clock, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle, AlertCircle } from "@/components/ui/alert";

const INTERVAL_OPTIONS = [
  { label: "5s", value: 5 },
  { label: "15s", value: 15 },
  { label: "30s", value: 30 },
];

export default function DashboardPage() {
  const [content, setContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [interval, setInterval_] = useState(5);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<string>("read_dashboard");
      setContent(result);
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(fetchDashboard, interval * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, interval, fetchDashboard]);

  return (
    <div className="flex flex-col h-full">
      {/* Sticky toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 bg-card/40 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Dashboard</h2>
          {autoRefresh && (
            <Circle
              className="h-2 w-2 fill-primary text-primary animate-pulse"
              aria-label="Auto-refresh active"
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {lastUpdated.toLocaleTimeString("ja-JP")}
            </span>
          )}

          <select
            value={interval}
            onChange={(e) => setInterval_(Number(e.target.value))}
            className="h-7 rounded border border-input bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Auto-refresh interval"
          >
            {INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <Button
            variant={autoRefresh ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? "Auto" : "Manual"}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={fetchDashboard}
            disabled={loading}
            aria-label="Reload dashboard"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto px-6 py-5">
        {error && (
          <Alert variant="destructive" className="mb-5">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {content && (
          <Card className="border-border/50">
            <CardContent className="pt-5 pb-6 px-6">
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )}

        {!content && !error && !loading && (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <p className="text-sm">dashboard.md is empty or not found.</p>
          </div>
        )}
      </div>
    </div>
  );
}

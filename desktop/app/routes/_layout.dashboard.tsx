import { invoke } from "@tauri-apps/api/core";
import { Circle, Clock, RefreshCw } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const INTERVAL_OPTIONS = [
  { label: "5s", value: 5 },
  { label: "15s", value: 15 },
  { label: "30s", value: 30 },
];

export default function DashboardPage() {
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const [content, setContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [interval, setInterval_] = useState(5);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      if (isTauri) {
        const result = await invoke<string>("read_dashboard");
        setContent(result);
      } else {
        const res = await fetch("/api/dashboard");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error);
        }
        setContent(data.content);
      }
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [isTauri]);

  // Initial load
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) {
      return;
    }
    const timer = window.setInterval(fetchDashboard, interval * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, interval, fetchDashboard]);

  return (
    <div className="flex h-full flex-col">
      {/* Sticky toolbar */}
      <div className="flex shrink-0 items-center justify-between border-border/50 border-b bg-card/40 px-5 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-sm">Dashboard</h2>
          {autoRefresh && (
            <Circle
              aria-label="Auto-refresh active"
              className="h-2 w-2 animate-pulse fill-primary text-primary"
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="flex items-center gap-1 text-muted-foreground text-xs">
              <Clock className="h-3 w-3" />
              {lastUpdated.toLocaleTimeString("ja-JP")}
            </span>
          )}

          <Select
            onValueChange={(val) => setInterval_(Number(val))}
            value={String(interval)}
          >
            <SelectTrigger className="h-7 w-[70px] border-input bg-background text-muted-foreground text-xs">
              <SelectValue placeholder="Select interval" />
            </SelectTrigger>
            <SelectContent>
              {INTERVAL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            className="h-7 px-2.5 text-xs"
            onClick={() => setAutoRefresh(!autoRefresh)}
            size="sm"
            variant={autoRefresh ? "default" : "ghost"}
          >
            {autoRefresh ? "Auto" : "Manual"}
          </Button>

          <Button
            aria-label="Reload dashboard"
            className="h-7 w-7"
            disabled={loading}
            onClick={fetchDashboard}
            size="icon"
            variant="ghost"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto px-6 py-5">
        {error && (
          <Alert className="mb-5" variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {content && (
          <Card className="border-border/50">
            <CardContent className="px-6 pt-5 pb-6">
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )}

        {!(content || error || loading) && (
          <div className="flex h-48 flex-col items-center justify-center text-muted-foreground">
            <p className="text-sm">dashboard.md is empty or not found.</p>
          </div>
        )}
      </div>
    </div>
  );
}

import { invoke } from "@tauri-apps/api/core";
import { Monitor, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { TmuxTerminal } from "@/components/tmux-terminal";
import { Button } from "@/components/ui/button";

interface TmuxPane {
  content: string;
  name: string;
}

export default function MonitorPage() {
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const [panes, setPanes] = useState<TmuxPane[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPanes = useCallback(async () => {
    try {
      let result: TmuxPane[];
      if (isTauri) {
        result = await invoke<TmuxPane[]>("get_tmux_panes");
      } else {
        const res = await fetch("/api/tmux-panes");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        result = await res.json();
      }
      setPanes(result);
      setError(null);
    } catch (e) {
      console.error("Failed to fetch tmux panes:", e);
      setError(String(e));
    }
  }, [isTauri]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    fetchPanes().finally(() => setLoading(false));
  }, [fetchPanes]);

  // Polling
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPanes();
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchPanes]);

  return (
    <div className="flex h-full flex-col bg-zinc-950/20">
      {/* Sticky toolbar */}
      <div className="flex shrink-0 items-center justify-between border-border/50 border-b bg-card/40 px-5 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Agent Monitor</h2>
          {panes.length > 0 && (
            <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary leading-none">
              {panes.length} PANES ACTIVE
            </span>
          )}
        </div>
        <Button
          aria-label="Refresh monitor"
          className="h-7 w-7"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            fetchPanes().finally(() => setLoading(false));
          }}
          size="icon"
          variant="ghost"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {error ? (
          <div className="flex h-64 flex-col items-center justify-center space-y-2 text-destructive">
            <span className="font-bold">Error connecting to tmux</span>
            <span className="text-xs opacity-70">{error}</span>
          </div>
        ) : panes.length === 0 ? (
          <div className="flex h-64 animate-pulse flex-col items-center justify-center text-muted-foreground">
            <RefreshCw className="mb-4 h-8 w-8 animate-spin opacity-20" />
            <span className="text-sm">Initializing monitor...</span>
          </div>
        ) : (
          <div className="grid h-full auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {panes.map((pane) => (
              <TmuxTerminal
                content={pane.content}
                key={pane.name}
                name={pane.name}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

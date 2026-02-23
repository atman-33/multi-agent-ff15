import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, RefreshCw, Server, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  AlertCircle,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ScriptStatus {
  executable: boolean;
  name: string;
}

interface HealthResult {
  inbox_readable: boolean;
  inbox_writable: boolean;
  python3_available: boolean;
  python3_version: string;
  scripts_executable: ScriptStatus[];
  tmux_available: boolean;
  tmux_version: string;
  wsl_detected: boolean;
  wsl_distro: string;
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs ${
        ok
          ? "border border-emerald-500/25 bg-emerald-500/15 text-emerald-400"
          : "border border-destructive/25 bg-destructive/15 text-destructive"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <XCircle className="h-3 w-3" />
      )}
      {label}
    </div>
  );
}

export default function HealthPage() {
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      if (isTauri) {
        const result = await invoke<HealthResult>("health_check");
        setHealth(result);
      } else {
        const res = await fetch("/api/health");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error);
        }
        setHealth(data as HealthResult);
      }
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [isTauri]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  return (
    <div className="flex h-full flex-col">
      {/* Sticky toolbar */}
      <div className="flex shrink-0 items-center justify-between border-border/50 border-b bg-card/40 px-5 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Health Check</h2>
        </div>
        <Button
          aria-label="Refresh health check"
          className="h-7 w-7"
          disabled={loading}
          onClick={fetchHealth}
          size="icon"
          variant="ghost"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto px-5 py-4">
        {error && (
          <Alert className="mb-4" variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Health Check Failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {health && (
          <div className="max-w-2xl space-y-3">
            {/* WSL */}
            <Card className="border-border/50">
              <CardHeader className="pt-4 pb-2">
                <CardTitle className="text-sm">WSL Environment</CardTitle>
                <CardDescription className="text-xs">
                  Windows Subsystem for Linux detection
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 pb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">WSL Detected</span>
                  <StatusBadge
                    label={health.wsl_detected ? "Yes" : "No"}
                    ok={health.wsl_detected}
                  />
                </div>
                {health.wsl_detected && health.wsl_distro && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">
                      Distribution
                    </span>
                    <span className="font-mono text-muted-foreground text-xs">
                      {health.wsl_distro}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dependencies */}
            <Card className="border-border/50">
              <CardHeader className="pt-4 pb-2">
                <CardTitle className="text-sm">Dependencies</CardTitle>
                <CardDescription className="text-xs">
                  Required system dependencies
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">tmux</span>
                    {health.tmux_version && (
                      <span className="font-mono text-[10px] text-muted-foreground/70">
                        {health.tmux_version}
                      </span>
                    )}
                  </div>
                  <StatusBadge
                    label={health.tmux_available ? "OK" : "Not Found"}
                    ok={health.tmux_available}
                  />
                </div>
                <div className="border-border/40 border-t" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">python3</span>
                    {health.python3_version && (
                      <span className="font-mono text-[10px] text-muted-foreground/70">
                        {health.python3_version}
                      </span>
                    )}
                  </div>
                  <StatusBadge
                    label={health.python3_available ? "OK" : "Not Found"}
                    ok={health.python3_available}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Scripts */}
            <Card className="border-border/50">
              <CardHeader className="pt-4 pb-2">
                <CardTitle className="text-sm">Script Permissions</CardTitle>
                <CardDescription className="text-xs">
                  Required scripts must be executable
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 pb-4">
                {health.scripts_executable.map((script, idx) => (
                  <div key={script.name}>
                    {idx > 0 && (
                      <div className="mb-2 border-border/40 border-t" />
                    )}
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-muted-foreground text-xs">
                        {script.name}
                      </span>
                      <StatusBadge
                        label={script.executable ? "OK" : "Not Executable"}
                        ok={script.executable}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Inbox Access */}
            <Card className="border-border/50">
              <CardHeader className="pt-4 pb-2">
                <CardTitle className="text-sm">Inbox Access</CardTitle>
                <CardDescription className="text-xs">
                  queue/inbox/ directory permissions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 pb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Readable</span>
                  <StatusBadge
                    label={health.inbox_readable ? "OK" : "Error"}
                    ok={health.inbox_readable}
                  />
                </div>
                <div className="border-border/40 border-t" />
                <div className="flex items-center justify-between">
                  <span className="text-sm">Writable</span>
                  <StatusBadge
                    label={health.inbox_writable ? "OK" : "Error"}
                    ok={health.inbox_writable}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {!(health || error || loading) && (
          <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
            Waiting for health check...
          </div>
        )}
      </div>
    </div>
  );
}

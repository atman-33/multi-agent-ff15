import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, CheckCircle2, XCircle, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle, AlertCircle } from "@/components/ui/alert";

interface ScriptStatus {
  name: string;
  executable: boolean;
}

interface HealthResult {
  wsl_detected: boolean;
  wsl_distro: string;
  tmux_available: boolean;
  tmux_version: string;
  python3_available: boolean;
  python3_version: string;
  scripts_executable: ScriptStatus[];
  inbox_readable: boolean;
  inbox_writable: boolean;
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
        ok
          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
          : "bg-destructive/15 text-destructive border border-destructive/25"
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
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const result = await invoke<HealthResult>("health_check");
      setHealth(result);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Sticky toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 bg-card/40 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Health Check</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={fetchHealth}
          disabled={loading}
          aria-label="Refresh health check"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto px-5 py-4">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Health Check Failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {health && (
          <div className="space-y-3 max-w-2xl">
            {/* WSL */}
            <Card className="border-border/50">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm">WSL Environment</CardTitle>
                <CardDescription className="text-xs">Windows Subsystem for Linux detection</CardDescription>
              </CardHeader>
              <CardContent className="pb-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">WSL Detected</span>
                  <StatusBadge
                    ok={health.wsl_detected}
                    label={health.wsl_detected ? "Yes" : "No"}
                  />
                </div>
                {health.wsl_detected && health.wsl_distro && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Distribution</span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {health.wsl_distro}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dependencies */}
            <Card className="border-border/50">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm">Dependencies</CardTitle>
                <CardDescription className="text-xs">Required system dependencies</CardDescription>
              </CardHeader>
              <CardContent className="pb-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">tmux</span>
                    {health.tmux_version && (
                      <span className="text-[10px] font-mono text-muted-foreground/70">
                        {health.tmux_version}
                      </span>
                    )}
                  </div>
                  <StatusBadge
                    ok={health.tmux_available}
                    label={health.tmux_available ? "OK" : "Not Found"}
                  />
                </div>
                <div className="border-t border-border/40" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">python3</span>
                    {health.python3_version && (
                      <span className="text-[10px] font-mono text-muted-foreground/70">
                        {health.python3_version}
                      </span>
                    )}
                  </div>
                  <StatusBadge
                    ok={health.python3_available}
                    label={health.python3_available ? "OK" : "Not Found"}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Scripts */}
            <Card className="border-border/50">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm">Script Permissions</CardTitle>
                <CardDescription className="text-xs">Required scripts must be executable</CardDescription>
              </CardHeader>
              <CardContent className="pb-4 space-y-2">
                {health.scripts_executable.map((script, idx) => (
                  <div key={script.name}>
                    {idx > 0 && <div className="border-t border-border/40 mb-2" />}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-muted-foreground">
                        {script.name}
                      </span>
                      <StatusBadge
                        ok={script.executable}
                        label={script.executable ? "OK" : "Not Executable"}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Inbox Access */}
            <Card className="border-border/50">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm">Inbox Access</CardTitle>
                <CardDescription className="text-xs">queue/inbox/ directory permissions</CardDescription>
              </CardHeader>
              <CardContent className="pb-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Readable</span>
                  <StatusBadge
                    ok={health.inbox_readable}
                    label={health.inbox_readable ? "OK" : "Error"}
                  />
                </div>
                <div className="border-t border-border/40" />
                <div className="flex items-center justify-between">
                  <span className="text-sm">Writable</span>
                  <StatusBadge
                    ok={health.inbox_writable}
                    label={health.inbox_writable ? "OK" : "Error"}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {!health && !error && !loading && (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            ヘルスチェック待機中...
          </div>
        )}
      </div>
    </div>
  );
}

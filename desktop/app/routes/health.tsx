import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, CheckCircle2, XCircle, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    <Badge variant={ok ? "success" : "destructive"}>
      {ok ? (
        <CheckCircle2 className="h-3 w-3 mr-1" />
      ) : (
        <XCircle className="h-3 w-3 mr-1" />
      )}
      {label}
    </Badge>
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
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Server className="h-6 w-6" />
          Health Check
        </h2>
        <Button
          variant="outline"
          size="icon"
          onClick={fetchHealth}
          disabled={loading}
          aria-label="Refresh health check"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Health Check Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {health && (
        <div className="space-y-4">
          {/* WSL */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">WSL Environment</CardTitle>
              <CardDescription>Windows Subsystem for Linux detection</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm">WSL Detected</span>
                <StatusBadge
                  ok={health.wsl_detected}
                  label={health.wsl_detected ? "Yes" : "No"}
                />
              </div>
              {health.wsl_detected && health.wsl_distro && (
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm">Distribution</span>
                  <span className="text-sm text-muted-foreground">
                    {health.wsl_distro}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dependencies */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dependencies</CardTitle>
              <CardDescription>Required system dependencies</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">tmux</span>
                  {health.tmux_version && (
                    <span className="text-xs text-muted-foreground ml-2">
                      {health.tmux_version}
                    </span>
                  )}
                </div>
                <StatusBadge
                  ok={health.tmux_available}
                  label={health.tmux_available ? "OK" : "Not Found"}
                />
              </div>
              <div className="border-t" />
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">python3</span>
                  {health.python3_version && (
                    <span className="text-xs text-muted-foreground ml-2">
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
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Script Permissions</CardTitle>
              <CardDescription>Required scripts must be executable</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {health.scripts_executable.map((script, idx) => (
                <div key={script.name}>
                  {idx > 0 && <div className="border-t mb-3" />}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono">{script.name}</span>
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
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Inbox Access</CardTitle>
              <CardDescription>queue/inbox/ directory permissions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Readable</span>
                <StatusBadge
                  ok={health.inbox_readable}
                  label={health.inbox_readable ? "OK" : "Error"}
                />
              </div>
              <div className="border-t" />
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
    </div>
  );
}

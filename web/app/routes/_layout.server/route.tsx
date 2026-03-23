import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  ServerCrash,
  Terminal,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/route";

type ServerStatus = {
  checkedAt: string;
  error: string | null;
  isRunning: boolean;
  lastStartedAt: string | null;
  managedByApp: boolean;
  state: "down" | "running" | "starting";
  url: string;
};

const formatTimestamp = (value: string | null): string => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};

const OpenCodeServerPage = (_props: Route.ComponentProps) => {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);

    try {
      const response = await fetch("/api/opencode/server");
      const data: ServerStatus = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }

      setStatus(data);
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    const id = window.setInterval(() => {
      fetchStatus();
    }, 10000);

    return () => {
      window.clearInterval(id);
    };
  }, [fetchStatus]);

  const handleRecover = useCallback(async () => {
    setIsRecovering(true);

    try {
      const response = await fetch("/api/opencode/server", {
        method: "POST",
      });
      const data: ServerStatus = await response.json();
      setStatus(data);

      if (!response.ok || !data.isRunning) {
        throw new Error(data.error ?? "Failed to restart OpenCode server");
      }

      toast.success("OpenCode server recovered", {
        description: data.managedByApp
          ? "A managed server process is now running."
          : "Connected to an existing server instance.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Failed to recover OpenCode server", {
        description: message,
      });
    } finally {
      setIsRecovering(false);
      fetchStatus();
    }
  }, [fetchStatus]);

  if (isLoading && !status) {
    return (
      <div className="flex min-h-80 items-center justify-center p-6">
        <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full max-w-4xl flex-col gap-5 overflow-auto p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-semibold text-xl">
            <Terminal className="h-5 w-5 text-primary" />
            OpenCode Server Monitor
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Check whether the local OpenCode server is healthy and recover it when it goes down.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            disabled={isLoading || isRecovering}
            onClick={fetchStatus}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button
            disabled={isRecovering || status?.state === "starting"}
            onClick={handleRecover}
            size="sm"
          >
            <ServerCrash className={cn("mr-1.5 h-3.5 w-3.5", isRecovering && "animate-pulse")} />
            Recover Server
          </Button>
        </div>
      </div>

      {fetchError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load server status</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      )}

      <Card className="border-border/60">
        <CardContent className="space-y-5 px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {status?.state === "running" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : status?.state === "starting" ? (
                <LoaderCircle className="h-5 w-5 animate-spin text-amber-500" />
              ) : (
                <ServerCrash className="h-5 w-5 text-destructive" />
              )}
              <div>
                <div className="font-medium text-base">Current status</div>
                <div className="text-muted-foreground text-sm">
                  {status?.state === "running"
                    ? "The OpenCode server responded to the latest health check."
                    : status?.state === "starting"
                      ? "The server is starting up right now."
                      : "The OpenCode server did not respond to the latest health check."}
                </div>
              </div>
            </div>

            <Badge
              className={cn(
                "px-2 py-0.5 text-xs capitalize",
                status?.state === "running" && "bg-emerald-500/15 text-emerald-600",
                status?.state === "starting" && "bg-amber-500/15 text-amber-600",
                status?.state === "down" && "bg-destructive/10 text-destructive"
              )}
              variant="secondary"
            >
              {status?.state ?? "unknown"}
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-background/60 p-4">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                Server URL
              </div>
              <div className="mt-2 font-mono text-sm">{status?.url ?? "-"}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/60 p-4">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                Managed By App
              </div>
              <div className="mt-2 text-sm">
                {status ? (status.managedByApp ? "Yes" : "No") : "-"}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/60 p-4">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                Last Checked
              </div>
              <div className="mt-2 text-sm">{formatTimestamp(status?.checkedAt ?? null)}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/60 p-4">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                Last Started
              </div>
              <div className="mt-2 text-sm">{formatTimestamp(status?.lastStartedAt ?? null)}</div>
            </div>
          </div>

          {status?.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Latest error</AlertTitle>
              <AlertDescription>{status.error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OpenCodeServerPage;

import { Monitor, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useRevalidator } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  readTmuxMonitorSnapshot,
  type TmuxMonitorSnapshot,
} from "@/lib/tmux-monitor.server";
import { TmuxMonitorPaneCard } from "./components/tmux-monitor-pane";
import type { Route } from "./+types/route";

const POLL_INTERVAL_MS = 2000;

export const loader = async (_args: Route.LoaderArgs): Promise<TmuxMonitorSnapshot> =>
  readTmuxMonitorSnapshot();

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function getTransportLabel(loaderData: TmuxMonitorSnapshot): string {
  if (loaderData.transportMode !== "tmux-resident") {
    return "App-Owned Transport";
  }

  return loaderData.bootstrapStatus?.isReady ? "Transport Ready" : "Transport Unavailable";
}

export const TmuxMonitorPage = ({ loaderData }: Route.ComponentProps) => {
  const revalidator = useRevalidator();

  useEffect(() => {
    if (loaderData.transportMode !== "tmux-resident") {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (revalidator.state === "idle") {
        revalidator.revalidate();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loaderData.transportMode, revalidator]);

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <div className="flex h-full min-h-0 w-full flex-col gap-5 overflow-hidden p-4 md:p-6">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/60 bg-background/70">
                <Monitor className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl">Tmux Monitor</h1>
                <p className="text-muted-foreground text-sm">
                  Inspect the tmux-resident transport and live pane output for each agent.
                </p>
              </div>
            </div>
          </div>

          <Button onClick={() => revalidator.revalidate()} type="button" variant="outline">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        <Card className="shrink-0">
          <CardContent className="grid gap-3 p-6 md:grid-cols-4">
            <div>
              <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Mode</div>
              <div className="mt-2 text-sm">{loaderData.transportMode}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Status</div>
              <div className="mt-2 text-sm">{getTransportLabel(loaderData)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Dispatcher PID</div>
              <div className="mt-2 text-sm">{loaderData.bootstrapStatus?.dispatcherPid ?? "-"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Last Started</div>
              <div className="mt-2 text-sm">
                {formatTimestamp(loaderData.bootstrapStatus?.lastStartedAt ?? null)}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:grid-rows-2">
          {loaderData.panes.map((pane) => (
            <TmuxMonitorPaneCard
              key={pane.target}
              pane={pane}
              status={loaderData.agentStatuses[pane.agentId] ?? "unknown"}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default TmuxMonitorPage;
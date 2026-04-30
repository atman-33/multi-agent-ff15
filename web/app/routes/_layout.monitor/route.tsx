import { Monitor, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useRevalidator } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const transportLabel = getTransportLabel(loaderData);
  const lastStarted = formatTimestamp(loaderData.bootstrapStatus?.lastStartedAt ?? null);

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
      <div className="flex h-full min-h-0 w-full flex-col gap-3 overflow-hidden p-3 md:p-4">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 pr-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-background/70">
                <Monitor className="h-4 w-4" />
              </div>
              <h1 className="text-base leading-none">Tmux Monitor</h1>
            </div>

            <Badge className="rounded-full px-2 py-1 text-[11px]" variant="outline">
              Mode: {loaderData.transportMode}
            </Badge>
            <Badge className="rounded-full px-2 py-1 text-[11px]" variant="outline">
              Status: {transportLabel}
            </Badge>
            <Badge className="rounded-full px-2 py-1 text-[11px]" variant="outline">
              PID: {loaderData.bootstrapStatus?.dispatcherPid ?? "-"}
            </Badge>
            <Badge className="rounded-full px-2 py-1 text-[11px]" variant="outline">
              Last Started: {lastStarted}
            </Badge>
          </div>

          <Button
            className="h-8 shrink-0 px-3 text-xs"
            onClick={() => revalidator.revalidate()}
            type="button"
            variant="outline"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-flow-col lg:grid-cols-3 lg:grid-rows-2">
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
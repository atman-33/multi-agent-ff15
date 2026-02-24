import { RefreshCw, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ALL_MODEL_SWITCH_AGENTS, type ModelSwitchAgent } from "@/lib/agents";
import { cn } from "@/lib/utils";
import ModeSwitcher from "./mode-switcher";

export type AgentStatus = "online" | "idle" | "stale";

interface StatusBarProps {
  contextUsage?: Record<string, number | null>;
  lastUpdated: Date | null;
  onRefresh: () => void;
}

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

export function computeStatus(lastResponseAt: Date | null): AgentStatus {
  if (!lastResponseAt) {
    return "stale";
  }
  const elapsed = Date.now() - lastResponseAt.getTime();
  if (elapsed < 60_000) {
    return "online";
  }
  if (elapsed < STALE_THRESHOLD_MS) {
    return "idle";
  }
  return "stale";
}

const AGENT_LABELS: Record<ModelSwitchAgent, string> = {
  noctis: "N",
  lunafreya: "L",
  ignis: "I",
  gladiolus: "G",
  prompto: "P",
  iris: "Ir",
};

function ContextMeter({
  agent,
  value,
}: {
  agent: ModelSwitchAgent;
  value: number | null;
}) {
  const label = AGENT_LABELS[agent];
  const colorClass =
    value === null
      ? "text-muted-foreground/40 border-border/20 bg-white/3"
      : value >= 80
        ? "text-red-400 border-red-500/40 bg-red-500/10"
        : value >= 50
          ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
          : "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";

  const barWidth = value === null ? 0 : Math.min(value, 100);
  const barColor =
    value === null
      ? "bg-border/20"
      : value >= 80
        ? "bg-red-500/60"
        : value >= 50
          ? "bg-amber-500/60"
          : "bg-emerald-500/60";

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex cursor-default flex-col items-center gap-0.5 rounded border px-1.5 py-0.5 transition-colors",
              colorClass
            )}
          >
            <span className="font-mono text-[9px] leading-none">{label}</span>
            <div className="h-1 w-8 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  barColor
                )}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <span className="font-mono text-[9px] tabular-nums leading-none">
              {value === null ? "-" : `${value}%`}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="px-2 py-1 text-[11px]" side="bottom">
          {agent}: {value === null ? "No data" : `${value}% context used`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function StatusBar({
  lastUpdated,
  onRefresh,
  contextUsage = {},
}: StatusBarProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const updatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "Never";

  return (
    <div className="flex items-center gap-3 rounded-md border border-border/30 bg-white/3 px-3 py-1.5 text-muted-foreground text-xs">
      <span className="shrink-0">Updated: {updatedStr}</span>

      <div className="h-3 w-px shrink-0 bg-border/40" />

      <div className="flex items-end gap-1">
        {ALL_MODEL_SWITCH_AGENTS.map((agent) => (
          <ContextMeter
            agent={agent}
            key={agent}
            value={contextUsage[agent] ?? null}
          />
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ModeSwitcher />
        <div className="h-4 w-px shrink-0 bg-border/40" />
        <Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
          <DialogTrigger asChild>
            <Button
              className="h-6 border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 hover:text-red-300"
              size="sm"
              title="Clear all queues and restart sessions"
              variant="outline"
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Clear All
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Clear All Sessions</DialogTitle>
              <DialogDescription>
                Are you sure you want to clear all agent interactions and start
                new sessions? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button disabled={isClearing} variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                disabled={isClearing}
                onClick={async () => {
                  setIsClearing(true);
                  try {
                    const res = await fetch("/api/session-clear-all", {
                      method: "POST",
                    });
                    if (res.ok) {
                      import("sonner").then(({ toast }) =>
                        toast.success("All chats and queues cleared!")
                      );
                      setIsDialogOpen(false);
                      onRefresh();
                    } else {
                      import("sonner").then(({ toast }) =>
                        toast.error("Failed to clear sessions.")
                      );
                    }
                  } catch (_e) {
                    import("sonner").then(({ toast }) =>
                      toast.error("Error clearing sessions.")
                    );
                  } finally {
                    setIsClearing(false);
                  }
                }}
                variant="destructive"
              >
                {isClearing ? "Clearing..." : "Continue"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div className="h-4 w-px shrink-0 bg-border/40" />
        <Button
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          onClick={onRefresh}
          size="icon"
          title="Refresh"
          variant="ghost"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

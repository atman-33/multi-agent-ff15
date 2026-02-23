import { Circle, RefreshCw, RotateCcw } from "lucide-react";
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
import type { AgentId } from "@/lib/useAgentChatLog";
import { cn } from "@/lib/utils";
import ModeSwitcher from "./ModeSwitcher";

export type AgentStatus = "online" | "idle" | "stale";

interface AgentStatusInfo {
  agent: AgentId;
  lastResponseAt: Date | null;
  status: AgentStatus;
}

interface StatusBarProps {
  agentStatuses: AgentStatusInfo[];
  lastUpdated: Date | null;
  onRefresh: () => void;
}

const STATUS_CONFIG: Record<AgentStatus, { color: string; label: string }> = {
  online: { color: "text-green-400", label: "online" },
  idle: { color: "text-yellow-400", label: "idle" },
  stale: { color: "text-muted-foreground", label: "stale" },
};

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

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

export default function StatusBar({
  agentStatuses,
  lastUpdated,
  onRefresh,
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
    <div className="flex items-center gap-4 rounded-md border border-border/30 bg-white/3 px-3 py-1.5 text-muted-foreground text-xs">
      {/* Last updated */}
      <span className="shrink-0">Updated: {updatedStr}</span>

      <div className="h-3 w-px shrink-0 bg-border/40" />

      {/* Per-agent status */}
      <div className="flex items-center gap-4">
        {agentStatuses.map(({ agent, status }) => {
          const { color, label } = STATUS_CONFIG[status];
          return (
            <div className="flex items-center gap-1.5" key={agent}>
              <Circle className={cn("h-2 w-2 fill-current", color)} />
              <span className="capitalize">
                {agent === "noctis" ? "Noctis" : "Lunafreya"}
              </span>
              <span className={cn("text-[10px]", color)}>{label}</span>
            </div>
          );
        })}
      </div>

      {/* Spacer + Actions */}
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
                  } catch (e) {
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

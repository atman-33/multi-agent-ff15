import { cn } from "@/lib/utils";
import { Circle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentId } from "@/lib/useAgentChatLog";

export type AgentStatus = "online" | "idle" | "stale";

interface AgentStatusInfo {
  agent: AgentId;
  status: AgentStatus;
  lastResponseAt: Date | null;
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
  if (!lastResponseAt) return "stale";
  const elapsed = Date.now() - lastResponseAt.getTime();
  if (elapsed < 60_000) return "online";
  if (elapsed < STALE_THRESHOLD_MS) return "idle";
  return "stale";
}

export default function StatusBar({
  agentStatuses,
  lastUpdated,
  onRefresh,
}: StatusBarProps) {
  const updatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "未更新";

  return (
    <div className="flex items-center gap-4 px-3 py-1.5 rounded-md border border-border/30 bg-white/3 text-xs text-muted-foreground">
      {/* Last updated */}
      <span className="shrink-0">最終更新: {updatedStr}</span>

      <div className="h-3 w-px bg-border/40 shrink-0" />

      {/* Per-agent status */}
      <div className="flex items-center gap-4">
        {agentStatuses.map(({ agent, status }) => {
          const { color, label } = STATUS_CONFIG[status];
          return (
            <div key={agent} className="flex items-center gap-1.5">
              <Circle className={cn("h-2 w-2 fill-current", color)} />
              <span className="capitalize">
                {agent === "noctis" ? "Noctis" : "Lunafreya"}
              </span>
              <span className={cn("text-[10px]", color)}>{label}</span>
            </div>
          );
        })}
      </div>

      {/* Spacer + refresh */}
      <div className="ml-auto">
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          onClick={onRefresh}
          title="今すぐ更新"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

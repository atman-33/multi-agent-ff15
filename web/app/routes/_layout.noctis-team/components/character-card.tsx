import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getAgentTheme } from "@/lib/agent-theme";
import type { AgentContextUsage } from "@/lib/types/mission";
import { cn } from "@/lib/utils";

export type AgentStatus = "idle" | "working" | "success" | "blocked";

export interface CharacterCardProps {
  agentId?: string;
  contextUsage?: AgentContextUsage | null;
  name: string;
  role: string;
  imageSrc: string;
  isSpeaking?: boolean;
  statusAccessory?: ReactNode;
  status: AgentStatus;
  task: string;
  detail?: string;
  progress?: number;
  metaAccessory?: ReactNode;
}

function getContextBarClass(contextUsage: AgentContextUsage): string {
  if (contextUsage.remainingPercentage <= 0.2) {
    return "bg-destructive";
  }

  if (contextUsage.remainingPercentage <= 0.4) {
    return "bg-orange-400";
  }

  if (contextUsage.remainingPercentage <= 0.7) {
    return "bg-yellow-300";
  }

  return "bg-emerald-400";
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

const statusConfig: Record<
  AgentStatus,
  { label: string; badgeClass: string; animation: string }
> = {
  idle: {
    label: "STANDBY",
    badgeClass: "bg-muted text-muted-foreground border-border/50",
    animation: "agent-float 3s ease-in-out infinite",
  },
  working: {
    label: "ACTIVE",
    badgeClass: "bg-primary/20 text-primary border-primary/40",
    animation: "agent-active 0.52s cubic-bezier(0.42, 0, 0.28, 1) infinite",
  },
  success: {
    label: "DONE",
    badgeClass:
      "bg-[hsl(var(--success)/0.2)] text-[hsl(var(--success))] border-[hsl(var(--success)/0.4)]",
    animation: "agent-report 1s ease-in-out infinite",
  },
  blocked: {
    label: "BLOCKED",
    badgeClass: "bg-destructive/20 text-destructive border-destructive/40",
    animation: "agent-blocked 0.4s ease-in-out infinite",
  },
};

const statusGlowColorFallback: Record<AgentStatus, string> = {
  idle: "rgba(100,120,180,0.15)",
  working: "rgba(59,130,246,0.3)",
  success: "rgba(34,197,94,0.25)",
  blocked: "rgba(239,68,68,0.25)",
};

export const CharacterCard = ({
  agentId,
  contextUsage,
  name,
  role,
  imageSrc,
  isSpeaking = false,
  statusAccessory,
  status,
  task,
  detail,
  progress,
  metaAccessory,
}: CharacterCardProps) => {
  const config = statusConfig[status];
  const theme = getAgentTheme(agentId ?? name);
  const imageFilter = [
    "drop-shadow(0 0 3px rgba(255,255,255,0.6))",
    "drop-shadow(0 0 6px rgba(255,255,255,0.25))",
    status === "working" && !isSpeaking
      ? `drop-shadow(0 0 8px ${theme?.glow ?? "rgba(99,102,241,0.6)"})`
      : null,
    isSpeaking ? `drop-shadow(0 0 10px ${theme?.glow ?? "rgba(125,211,252,0.55)"})` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cn(
        "relative flex flex-col gap-1.5 overflow-hidden rounded-xl border border-border/50 bg-card/60 px-3 py-2",
        "transition-all duration-500 backdrop-blur-sm",
        status === "working" && "border-primary/30 shadow-primary/10 shadow-lg",
        status === "success" &&
          "border-[hsl(var(--success)/0.3)] shadow-lg shadow-[hsl(var(--success)/0.08)]",
        status === "blocked" && "border-destructive/30"
      )}
      style={
        isSpeaking
          ? {
              borderColor: theme?.ring ?? "rgba(125,211,252,0.45)",
              background: theme?.surface ?? "rgba(14,165,233,0.08)",
              boxShadow: `0 0 26px ${theme?.glowSoft ?? "rgba(125,211,252,0.18)"}`,
            }
          : undefined
      }
    >
      {theme ? (
        <div
          className="pointer-events-none absolute inset-x-3 top-0 h-px rounded-full"
          style={{ background: `linear-gradient(90deg, transparent, ${theme.accentStrong}, transparent)` }}
        />
      ) : null}
      <div className="flex min-w-0 flex-row items-center gap-3">
        <div className="relative flex h-14 w-10 shrink-0 items-end justify-center">
          {status === "working" ? (
            <span
              className="pointer-events-none absolute inset-x-1 bottom-1 h-8 animate-ping rounded-full"
              style={{ background: theme?.surfaceStrong ?? "rgba(59,130,246,0.2)" }}
            />
          ) : null}
          <div
            className="pointer-events-none absolute bottom-0 left-1/2 h-8 w-8 -translate-x-1/2 rounded-full blur-lg"
            style={{
              background: theme
                ? `radial-gradient(circle, ${theme.glow} 0%, ${theme.glowSoft} 68%, rgba(0,0,0,0) 100%)`
                : statusGlowColorFallback[status],
              animation: isSpeaking ? "agent-speaking-glow 0.9s ease-in-out infinite" : "agent-glow 2s ease-in-out infinite",
            }}
          />
          {isSpeaking ? (
            <div
              className="pointer-events-none absolute -top-1 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-full border px-1.5 py-0.5 backdrop-blur-sm"
              style={{
                borderColor: theme?.ring ?? "rgba(125,211,252,0.4)",
                background: theme?.surfaceStrong ?? "rgba(14,165,233,0.18)",
                boxShadow: `0 0 16px ${theme?.glowSoft ?? "rgba(125,211,252,0.2)"}`,
              }}
            >
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="h-1 w-1 rounded-full"
                  style={{
                    background: theme?.text ?? "rgba(224,242,254,0.9)",
                    animation: `banter-dot 0.9s ease-in-out ${dot * 0.12}s infinite`,
                  }}
                />
              ))}
            </div>
          ) : null}
          <img
            alt={name}
            src={imageSrc}
            className={cn(
              "relative z-10 h-full w-full object-contain object-bottom",
              status === "working" && !isSpeaking && "animate-bounce"
            )}
            style={{
              animation: isSpeaking
                ? "agent-listening 0.9s ease-in-out infinite"
                : status === "working"
                  ? undefined
                  : config.animation,
              filter: imageFilter,
            }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-bold text-sm tracking-wider text-foreground uppercase">
                {name}
              </span>
              <span className="shrink-0 font-mono text-[9px] text-muted-foreground uppercase tracking-widest">
                {role}
              </span>
              {isSpeaking ? (
                <span
                  className="shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.18em]"
                  style={{
                    borderColor: theme?.ring ?? "rgba(125, 211, 252, 0.4)",
                    background: theme?.surfaceStrong ?? "rgba(14, 165, 233, 0.15)",
                    color: theme?.text ?? "rgba(224, 242, 254, 0.9)",
                  }}
                >
                  talking
                </span>
              ) : null}
            </div>
            <p className="max-w-32 truncate text-right font-mono text-[10px] text-muted-foreground/70">
              {task}
            </p>
          </div>
          {detail && (
            <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground/50">{detail}</p>
          )}
          {contextUsage ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="mt-1.5 cursor-help">
                  <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.18em]">
                    <span className="text-muted-foreground/70">
                      CTX budget
                    </span>
                    <span className="text-foreground/80">{formatPercent(contextUsage.remainingPercentage)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", getContextBarClass(contextUsage))}
                      style={{ width: `${Math.min(100, Math.max(0, contextUsage.remainingPercentage * 100))}%` }}
                    />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="font-mono text-[10px]">
                <div className="flex min-w-32 items-center justify-between gap-3">
                  <span className="text-muted-foreground">Remaining</span>
                  <span>{contextUsage.remainingTokens.toLocaleString()}</span>
                </div>
                <div className="flex min-w-32 items-center justify-between gap-3">
                  <span className="text-muted-foreground">Window</span>
                  <span>{contextUsage.limitTokens.toLocaleString()}</span>
                </div>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="mt-1.5 cursor-help">
                  <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.18em]">
                    <span className="text-muted-foreground/70">CTX budget</span>
                    <span className="text-foreground/80">100%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
                    <div className="h-full w-full rounded-full bg-emerald-400 transition-all duration-500" />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="font-mono text-[10px]">
                <div className="flex min-w-32 items-center justify-between gap-3">
                  <span className="text-muted-foreground">Remaining</span>
                  <span>-</span>
                </div>
                <div className="flex min-w-32 items-center justify-between gap-3">
                  <span className="text-muted-foreground">Window</span>
                  <span>-</span>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
          {metaAccessory ? <div className="mt-1 min-w-0 max-w-60">{metaAccessory}</div> : null}
          {status === "working" && progress !== undefined && (
            <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-border/40">
              <div
                className="h-full rounded-full bg-primary/70 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          )}
        </div>

        <div className="flex w-20 shrink-0 flex-col items-stretch gap-1 self-start pt-0.5">
          {statusAccessory ? statusAccessory : null}
          <div
            className={cn(
              "w-full rounded-full border px-2 py-0.5 text-center font-mono text-[9px] font-semibold uppercase tracking-widest",
              config.badgeClass
            )}
          >
            {config.label}
          </div>
        </div>
      </div>
    </div>
  );
};

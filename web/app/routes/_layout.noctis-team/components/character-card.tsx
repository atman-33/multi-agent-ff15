import { cn } from "@/lib/utils";

export type AgentStatus = "idle" | "working" | "success" | "blocked";

export interface CharacterCardProps {
  name: string;
  role: string;
  imageSrc: string;
  status: AgentStatus;
  task: string;
  detail?: string;
  progress?: number;
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

const statusGlowColor: Record<AgentStatus, string> = {
  idle: "rgba(100,120,180,0.15)",
  working: "rgba(59,130,246,0.3)",
  success: "rgba(34,197,94,0.25)",
  blocked: "rgba(239,68,68,0.25)",
};

export const CharacterCard = ({
  name,
  role,
  imageSrc,
  status,
  task,
  detail,
  progress,
}: CharacterCardProps) => {
  const config = statusConfig[status];

  return (
    <div
      className={cn(
        "flex flex-row items-center gap-3 rounded-xl border border-border/50 bg-card/60 px-3 py-2",
        "transition-all duration-500 backdrop-blur-sm",
        status === "working" && "border-primary/30 shadow-primary/10 shadow-lg",
        status === "success" &&
          "border-[hsl(var(--success)/0.3)] shadow-lg shadow-[hsl(var(--success)/0.08)]",
        status === "blocked" && "border-destructive/30"
      )}
    >
      <div className="relative flex h-14 w-10 shrink-0 items-end justify-center">
        {status === "working" ? (
          <span className="pointer-events-none absolute inset-x-1 bottom-1 h-8 animate-ping rounded-full bg-primary/20" />
        ) : null}
        <div
          className="pointer-events-none absolute bottom-0 left-1/2 h-8 w-8 -translate-x-1/2 rounded-full blur-lg"
          style={{
            background: statusGlowColor[status],
            animation: "agent-glow 2s ease-in-out infinite",
          }}
        />
        <img
          alt={name}
          src={imageSrc}
          className={cn(
            "relative z-10 h-full w-full object-contain object-bottom",
            status === "working" && "animate-bounce drop-shadow-[0_0_6px_rgba(99,102,241,0.6)]"
          )}
          style={{
            animation: status === "working" ? undefined : config.animation,
            filter: "drop-shadow(0 0 3px rgba(255,255,255,0.6)) drop-shadow(0 0 6px rgba(255,255,255,0.25))",
          }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm tracking-wider text-foreground uppercase">{name}</span>
          <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest">{role}</span>
        </div>
        <p className="truncate font-mono text-[10px] text-muted-foreground/70">{task}</p>
        {detail && (
          <p className="truncate font-mono text-[9px] text-muted-foreground/50 mt-0.5">{detail}</p>
        )}
        {status === "working" && progress !== undefined && (
          <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-border/40">
            <div
              className="h-full rounded-full bg-primary/70 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
      </div>

      <div
        className={cn(
          "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-widest",
          config.badgeClass
        )}
      >
        {config.label}
      </div>
    </div>
  );
};

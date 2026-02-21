import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  COMRADES,
  COMRADE_CONFIG,
  type ComradeId,
} from "@/lib/useComradeStatus";

interface ComradeAvatarBarProps {
  busyMap: Record<ComradeId, boolean>;
}

function ComradeAvatar({
  agent,
  busy,
}: {
  agent: ComradeId;
  busy: boolean;
}) {
  const { label, imageSrc } = COMRADE_CONFIG[agent];
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="flex flex-col items-center gap-1"
      title={busy ? `${label}: 処理中...` : label}
    >
      <div className="relative">
        {/* Busy glow ring */}
        {busy && (
          <span className="absolute inset-0 rounded-full animate-ping bg-amber-400/30" />
        )}
        <div
          className={cn(
            "h-10 w-10 rounded-full overflow-hidden border-2 transition-all duration-300",
            busy
              ? "border-amber-400/70 shadow-[0_0_8px_rgba(251,191,36,0.5)] animate-bounce"
              : "border-border/30 opacity-50 grayscale"
          )}
        >
          {!imgError ? (
            <img
              src={imageSrc}
              alt={label}
              onError={() => setImgError(true)}
              className="h-full w-full object-cover object-top"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-white/5 text-[10px] font-semibold text-muted-foreground">
              {label[0]}
            </div>
          )}
        </div>
      </div>
      <span
        className={cn(
          "text-[9px] font-medium transition-colors",
          busy ? "text-amber-400/90" : "text-muted-foreground/40"
        )}
      >
        {label}
      </span>
    </div>
  );
}

/**
 * ComradeAvatarBar
 *
 * Displays Ignis, Gladiolus, Prompto, and Iris avatar icons.
 * Idle agents appear dimmed; busy agents bounce with an amber glow.
 */
export default function ComradeAvatarBar({ busyMap }: ComradeAvatarBarProps) {
  const activeBusyCount = COMRADES.filter((a) => busyMap[a]).length;

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border/30 bg-white/3">
      <span className="text-[9px] text-muted-foreground/40 mr-2 shrink-0">
        Comrades
      </span>
      <div className="flex items-end gap-3">
        {COMRADES.map((agent) => (
          <ComradeAvatar key={agent} agent={agent} busy={busyMap[agent]} />
        ))}
      </div>
      {activeBusyCount > 0 && (
        <span className="ml-auto text-[9px] text-amber-400/70 shrink-0">
          {activeBusyCount} active
        </span>
      )}
    </div>
  );
}

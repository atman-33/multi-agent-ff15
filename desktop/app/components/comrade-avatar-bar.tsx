import { useState } from "react";
import {
  COMRADE_CONFIG,
  COMRADES,
  type ComradeId,
} from "@/constants/comrade-config";
import { cn } from "@/lib/utils";

interface ComradeAvatarBarProps {
  busyMap: Record<ComradeId, boolean>;
}

function ComradeAvatar({ agent, busy }: { agent: ComradeId; busy: boolean }) {
  const { label, imageSrc } = COMRADE_CONFIG[agent];
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="flex flex-col items-center gap-1"
      title={busy ? `${label}: Processing...` : label}
    >
      <div className="relative">
        {/* Busy glow ring */}
        {busy && (
          <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/30" />
        )}
        <div
          className={cn(
            "h-10 w-10 overflow-hidden rounded-full border-2 transition-all duration-300",
            busy
              ? "animate-bounce border-amber-400/70 shadow-[0_0_8px_rgba(251,191,36,0.5)]"
              : "border-border/30 opacity-50 grayscale"
          )}
        >
          {imgError ? (
            <div className="flex h-full w-full items-center justify-center bg-white/5 font-semibold text-[10px] text-muted-foreground">
              {label[0]}
            </div>
          ) : (
            <img
              alt={label}
              className="h-full w-full object-cover object-top"
              onError={() => setImgError(true)}
              src={imageSrc}
            />
          )}
        </div>
      </div>
      <span
        className={cn(
          "font-medium text-[9px] transition-colors",
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
    <div className="flex items-center gap-1 rounded-lg border border-border/30 bg-white/3 px-3 py-1.5">
      <span className="mr-2 shrink-0 text-[9px] text-muted-foreground/40">
        Comrades
      </span>
      <div className="flex items-end gap-3">
        {COMRADES.map((agent) => (
          <ComradeAvatar agent={agent} busy={busyMap[agent]} key={agent} />
        ))}
      </div>
      {activeBusyCount > 0 && (
        <span className="ml-auto shrink-0 text-[9px] text-amber-400/70">
          {activeBusyCount} active
        </span>
      )}
    </div>
  );
}

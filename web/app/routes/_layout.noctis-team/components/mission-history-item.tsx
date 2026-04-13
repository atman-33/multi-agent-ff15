import { Archive, Check, LoaderCircle, Pencil, RotateCcw, X } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { NavLink } from "react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { MissionSummary } from "@/hooks/use-agent-session";
import { cn } from "@/lib/utils";
import { buildMissionPath } from "./output-detail-routing";

export type MissionHistoryItemProps = {
  mission: MissionSummary;
  routeBase: string;
  isActive: boolean;
  isArchivedView: boolean;
  isEditing: boolean;
  isArchivePending: boolean;
  isArchiveDisabled: boolean;
  isRenaming: boolean;
  isRunning: boolean;
  onBeginRename: (mission: MissionSummary) => void;
  onArchiveAction: (mission: MissionSummary, action: "archive" | "restore") => void;
  onCancelRename: () => void;
  onSubmitRename: (missionId: string, title: string) => void;
};

export const MissionHistoryItem = memo(
  ({
    mission,
    routeBase,
    isActive,
    isArchivedView,
    isEditing,
    isArchivePending,
    isArchiveDisabled,
    isRenaming,
    isRunning,
    onBeginRename,
    onArchiveAction,
    onCancelRename,
    onSubmitRename,
  }: MissionHistoryItemProps) => {
    const [draftTitle, setDraftTitle] = useState(mission.title || "Untitled mission");

    useEffect(() => {
      if (isEditing) {
        setDraftTitle(mission.title || "Untitled mission");
      }
    }, [isEditing, mission.title]);

    if (isEditing) {
      return (
        <div className="rounded-xl border border-primary/30 bg-primary/8 p-3">
          <Textarea
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            rows={2}
            disabled={isRenaming}
            className="min-h-14 resize-none bg-transparent text-xs"
          />
          <div className="mt-2 flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onCancelRename}
              disabled={isRenaming}
              title="Cancel rename"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onSubmitRename(mission.missionId, draftTitle)}
              disabled={isRenaming || !draftTitle.trim()}
              title="Save title"
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "group relative w-full min-w-0 max-w-full overflow-hidden rounded-xl border p-3 transition-colors",
          isActive ? "border-primary/40 bg-primary/10" : "border-border/50 bg-card/40 hover:bg-card/70",
        )}
      >
        <NavLink
          aria-label={`Open mission ${mission.title}`}
          className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
          to={buildMissionPath(mission.missionId, routeBase)}
        />
        <div className="grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-2 overflow-hidden">
          <div className="pointer-events-none min-w-0 overflow-hidden">
            <div className="flex min-w-0 items-start gap-2">
              {isRunning ? <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> : null}
              <span className="block min-w-0 font-semibold text-sm leading-5 line-clamp-2 wrap-break-word">
                {mission.title}
              </span>
            </div>
            <div className="mt-2 flex min-w-0 items-center gap-2">
              <span className="max-w-24 shrink-0 truncate rounded-full border border-border/50 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">
                {mission.status}
              </span>
              <p className="min-w-0 flex-1 truncate text-right font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">
                {new Date(mission.updatedAt).toLocaleString("en-US", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </p>
            </div>
          </div>
          <div className="relative z-10 flex items-center gap-1">
            {!isArchivedView ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-6 w-6 shrink-0 transition-[opacity,color,background-color]",
                  "bg-background/30 text-foreground/70 opacity-0",
                  "group-hover:opacity-100 hover:bg-accent hover:text-foreground",
                  "focus-visible:opacity-100",
                )}
                onClick={() => onBeginRename(mission)}
                title="Rename mission"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-6 w-6 shrink-0 transition-[opacity,color,background-color]",
                "bg-background/30 text-foreground/70 opacity-0",
                "group-hover:opacity-100 hover:bg-accent hover:text-foreground",
                "focus-visible:opacity-100",
              )}
              onClick={() => onArchiveAction(mission, isArchivedView ? "restore" : "archive")}
              disabled={isArchivePending || isArchiveDisabled}
              title={
                isArchivedView
                  ? "Restore mission"
                  : isArchiveDisabled
                    ? "Active mission cannot be archived while running"
                    : "Archive mission"
              }
            >
              {isArchivedView ? <RotateCcw className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </div>
    );
  },
);

MissionHistoryItem.displayName = "MissionHistoryItem";
import { Check, History, Pencil, Plus, X } from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  type MissionResumePayload,
  type MissionSummary,
  useAgentSession,
} from "@/hooks/use-agent-session";
import type { AppLanguage } from "@/lib/app-language.server";
import { cn } from "@/lib/utils";
import type { PromptPart } from "@/lib/prompt-parts";
import type { MessageInfo } from "@/routes/_layout.opencode.session.$id/types";
import { BanterLog } from "./banter-log";
import { ChatArea } from "./chat-area";
import { PartyStatusPanel } from "./party-status-panel";

const LAST_MISSION_STORAGE_KEY = "noctis-team:last-mission-id";

type MissionHistoryItemProps = {
  mission: MissionSummary;
  isActive: boolean;
  isEditing: boolean;
  isRenaming: boolean;
  onBeginRename: (mission: MissionSummary) => void;
  onCancelRename: () => void;
  onSubmitRename: (missionId: string, title: string) => void;
};

const MissionHistoryItem = memo(
  ({
    mission,
    isActive,
    isEditing,
    isRenaming,
    onBeginRename,
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
          "group w-full min-w-0 max-w-full overflow-hidden rounded-xl border p-3 transition-colors",
          isActive ? "border-primary/40 bg-primary/10" : "border-border/50 bg-card/40 hover:bg-card/70"
        )}
      >
        <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <NavLink
            className="block min-w-0"
            to={`/noctis-team/mission/${mission.missionId}`}
          >
            <div className="mb-1 flex min-w-0 items-center gap-2">
              <span className="block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-sm">
                {mission.title}
              </span>
              <span className="max-w-28 shrink-0 truncate rounded-full border border-border/50 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">
                {mission.status}
              </span>
            </div>
            <p className="line-clamp-2 font-mono text-[10px] text-muted-foreground/70">
              {mission.objective || "No objective recorded"}
            </p>
            <p className="mt-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">
              {new Date(mission.updatedAt).toLocaleString("en-US", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </p>
          </NavLink>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-6 w-6 shrink-0 transition-[opacity,color,background-color]",
              "bg-background/30 text-foreground/70 opacity-0",
              "group-hover:opacity-100 hover:bg-accent hover:text-foreground",
              "focus-visible:opacity-100"
            )}
            onClick={() => onBeginRename(mission)}
            title="Rename mission"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }
);

export interface NoctisTeamScreenProps {
  activeMissionId: string | null;
  language?: AppLanguage;
  initialMissionData?: MissionResumePayload | null;
  initialMessageInfos?: MessageInfo[] | null;
}

export function NoctisTeamScreen({
  activeMissionId,
  language = "other",
  initialMissionData,
  initialMessageInfos,
}: NoctisTeamScreenProps) {
  const navigate = useNavigate();
  const params = useParams();
  const routeMissionId = params.id ?? null;
  const effectiveMissionId = activeMissionId ?? routeMissionId;

  useEffect(() => {
    if (!effectiveMissionId) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(LAST_MISSION_STORAGE_KEY, effectiveMissionId);
  }, [effectiveMissionId]);

  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [isLoadingMissions, setIsLoadingMissions] = useState(true);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [isRenamingMission, setIsRenamingMission] = useState(false);
  const {
    messages,
    banterEntries,
    latestBanterEntryId,
    partyMembers,
    speakingAgentId,
    isSessionActive,
    isStreaming,
    isLoadingHistory,
    send,
    abort,
  } = useAgentSession({
    activeMissionId: effectiveMissionId,
    language,
    initialMissionData,
    initialMessageInfos,
  });

  const loadMissions = useCallback(async () => {
    setIsLoadingMissions(true);
    try {
      const res = await fetch("/api/noctis/missions");
      if (!res.ok) {
        throw new Error(`missions failed: ${res.status}`);
      }
      const data = (await res.json()) as { missions?: MissionSummary[] };
      setMissions(data.missions ?? []);
    } catch {
      setMissions([]);
    } finally {
      setIsLoadingMissions(false);
    }
  }, []);

  useEffect(() => {
    void loadMissions();
  }, [loadMissions]);

  const beginRenameMission = useCallback((mission: MissionSummary) => {
    setEditingMissionId(mission.missionId);
  }, []);

  const cancelRenameMission = useCallback(() => {
    setEditingMissionId(null);
  }, []);

  const submitRenameMission = useCallback(async (missionId: string, nextTitle: string) => {
    const title = nextTitle.trim();
    if (!title) {
      toast.error("Mission title cannot be empty");
      return;
    }

    setIsRenamingMission(true);
    try {
      const response = await fetch(`/api/noctis/missions/${missionId}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      if (!response.ok) {
        throw new Error("Failed to rename mission");
      }

      const data = (await response.json()) as {
        mission?: { title?: string; updatedAt?: string };
      };
      const updatedTitle = data.mission?.title ?? title;
      const updatedAt = data.mission?.updatedAt ?? new Date().toISOString();

      setMissions((current) =>
        current.map((mission) =>
          mission.missionId === missionId ? { ...mission, title: updatedTitle, updatedAt } : mission
        )
      );
      setEditingMissionId(null);
    } catch {
      toast.error("Unable to rename mission", {
        description: "Mission metadata could not be updated.",
      });
    } finally {
      setIsRenamingMission(false);
    }
  }, []);

  const handleSend = useCallback(
    async (parts: PromptPart[]) => {
      const missionId = await send(parts);
      if (!effectiveMissionId && missionId) {
        await loadMissions();
        navigate(`/noctis-team/mission/${missionId}`, { replace: true });
      }
    },
    [effectiveMissionId, loadMissions, navigate, send]
  );

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden">
      <ResizablePanelGroup
        orientation="horizontal"
        className="relative h-full min-h-0 w-full overflow-hidden"
      >
        <ResizablePanel defaultSize={20}>
          <div className="flex h-full min-h-0 min-w-0 flex-col border-border/50 border-r bg-background/30 backdrop-blur-sm">
            <div className="w-full border-border/50 border-b p-3">
              <div className="mb-3 flex w-full items-center gap-2">
                <History className="h-4 w-4 text-primary/80" />
                <div>
                  <h2 className="font-semibold text-sm">Mission History</h2>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
                    Resume by mission
                  </p>
                </div>
              </div>
              <Button
                className="w-full justify-start gap-2"
                type="button"
                variant={effectiveMissionId === null ? "default" : "outline"}
                onClick={() => navigate("/noctis-team", { state: { skipMissionRestore: true } })}
              >
                <Plus className="h-4 w-4" />
                New Mission
              </Button>
            </div>

            <ScrollArea
              className="min-h-0 w-full min-w-0 flex-1"
              viewportClassName="[&>div]:!block [&>div]:!w-full"
            >
              <div className="w-full min-w-0 max-w-full space-y-2 overflow-x-hidden p-3 pr-4">
                {isLoadingMissions ? (
                  <div className="rounded-lg border border-border/50 bg-card/40 p-3 font-mono text-[11px] text-muted-foreground/70">
                    Loading missions...
                  </div>
                ) : missions.length === 0 ? (
                  <div className="rounded-lg border border-border/50 bg-card/40 p-3 font-mono text-[11px] text-muted-foreground/70">
                    No saved missions yet.
                  </div>
                ) : (
                  missions.map((mission) => (
                    <MissionHistoryItem
                      key={mission.missionId}
                      mission={mission}
                      isActive={effectiveMissionId === mission.missionId}
                      isEditing={editingMissionId === mission.missionId}
                      isRenaming={isRenamingMission}
                      onBeginRename={beginRenameMission}
                      onCancelRename={cancelRenameMission}
                      onSubmitRename={submitRenameMission}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizablePanel defaultSize={50}>
          <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-border/50 border-r">
            <ChatArea
              isResponding={isSessionActive || isLoadingHistory}
              isSessionActive={isSessionActive}
              isStreaming={isStreaming}
              messages={messages}
              onAbort={abort}
              onSend={handleSend}
              showAbortAction={isSessionActive && !isLoadingHistory}
            />
          </div>
        </ResizablePanel>

        <ResizablePanel defaultSize={30}>
          <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="shrink-0 border-border/50 border-b p-3">
              <PartyStatusPanel members={partyMembers} speakingAgentId={speakingAgentId} />
            </div>

            <div className="min-h-0 flex-1 overflow-hidden p-3">
              <BanterLog
                entries={effectiveMissionId ? banterEntries : []}
                latestEntryId={effectiveMissionId ? latestBanterEntryId : null}
              />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

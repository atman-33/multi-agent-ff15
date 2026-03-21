import { History, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgentSession, type MissionResumePayload, type MissionSummary } from "@/hooks/use-agent-session";
import type { MessageInfo } from "@/routes/_layout.opencode.session.$id/types";
import { BanterLog } from "./banter-log";
import { ChatArea } from "./chat-area";
import { PartyStatusPanel } from "./party-status-panel";

export interface NoctisTeamScreenProps {
  activeMissionId: string | null;
  initialMissionData?: MissionResumePayload | null;
  initialMessageInfos?: MessageInfo[] | null;
}

export function NoctisTeamScreen({
  activeMissionId,
  initialMissionData,
  initialMessageInfos,
}: NoctisTeamScreenProps) {
  const navigate = useNavigate();
  const params = useParams();
  const routeMissionId = params.id ?? null;
  const effectiveMissionId = activeMissionId ?? routeMissionId;

  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [isLoadingMissions, setIsLoadingMissions] = useState(true);
  const {
    messages,
    banterEntries,
    partyMembers,
    isSessionActive,
    isStreaming,
    isLoadingHistory,
    isAwaitingReply,
    send,
    abort,
  } = useAgentSession({
    activeMissionId: effectiveMissionId,
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

  const handleSend = useCallback(
    async (text: string) => {
      const missionId = await send(text);
      if (!effectiveMissionId && missionId) {
        await loadMissions();
        navigate(`/noctis-team/mission/${missionId}`, { replace: true });
      }
    },
    [effectiveMissionId, loadMissions, navigate, send]
  );

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "url('/images/backgrounds/background-1.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-background/80" />

      <div className="relative flex h-full min-h-0 w-full gap-0">
        <div className="flex min-h-0 w-70 shrink-0 flex-col border-border/50 border-r bg-background/30 backdrop-blur-sm">
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
              onClick={() => navigate("/noctis-team")}
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
                  <NavLink
                    key={mission.missionId}
                    className={({ isActive }) =>
                      `block w-full min-w-0 max-w-full overflow-hidden rounded-xl border p-3 text-left transition-colors ${
                        isActive || effectiveMissionId === mission.missionId
                          ? "border-primary/40 bg-primary/10"
                          : "border-border/50 bg-card/40 hover:bg-card/70"
                      }`
                    }
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
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border/50 border-r"
          style={{ flex: "0 0 calc(60% - 140px)" }}
        >
          <ChatArea
            isResponding={isAwaitingReply || isLoadingHistory}
            isSessionActive={isSessionActive}
            isStreaming={isStreaming}
            messages={messages}
            onAbort={abort}
            onSend={handleSend}
            showAbortAction={isSessionActive && !isLoadingHistory}
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden border-border/50 border-b p-3">
            <PartyStatusPanel members={partyMembers} />
          </div>

          <div className="min-h-0 flex-1 overflow-hidden p-3">
            <BanterLog entries={banterEntries} />
          </div>
        </div>
      </div>
    </div>
  );
}
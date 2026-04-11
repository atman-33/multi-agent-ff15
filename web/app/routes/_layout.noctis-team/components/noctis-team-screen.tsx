import { Archive, Check, Ellipsis, History, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useMatch, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type MissionResumePayload,
  type MissionSummary,
  useAgentSession,
} from "@/hooks/use-agent-session";
import { useProjectRegistry } from "@/hooks/use-project-registry";
import type { AppLanguage } from "@/lib/app-language.server";
import { normalizeContextProjectIds } from "@/lib/execution-context";
import type { MissionOutputSummary } from "@/lib/types/mission";
import { cn } from "@/lib/utils";
import type { PromptPart } from "@/lib/prompt-parts";
import type { MessageInfo } from "@/routes/_layout.opencode.session.$id/types";
import { BanterLog } from "./banter-log";
import { ChatArea } from "./chat-area";
import {
  getMissionOutputKey,
  MissionOutputBrowser,
} from "./mission-output-browser";
import {
  buildMissionOutputDetailPath,
  buildMissionPath,
  hasMissionOutputDetailRoute,
  resolveMissionInspectorTab,
} from "./output-detail-routing";
import { PartyStatusPanel } from "./party-status-panel";

const LAST_MISSION_STORAGE_KEY = "noctis-team:last-mission-id";

type BulkMissionAction = "archive" | "restore";

type BulkMissionDialogState = {
  action: BulkMissionAction;
  count: number;
  skipped: number;
} | null;

type InspectorTab = "banter" | "outputs";

type MissionHistoryItemProps = {
  mission: MissionSummary;
  isActive: boolean;
  isArchivedView: boolean;
  isEditing: boolean;
  isArchivePending: boolean;
  isArchiveDisabled: boolean;
  isRenaming: boolean;
  onBeginRename: (mission: MissionSummary) => void;
  onArchiveAction: (mission: MissionSummary, action: "archive" | "restore") => void;
  onCancelRename: () => void;
  onSubmitRename: (missionId: string, title: string) => void;
};

const MissionHistoryItem = memo(
  ({
    mission,
    isActive,
    isArchivedView,
    isEditing,
    isArchivePending,
    isArchiveDisabled,
    isRenaming,
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
          isActive ? "border-primary/40 bg-primary/10" : "border-border/50 bg-card/40 hover:bg-card/70"
        )}
      >
        <NavLink
          aria-label={`Open mission ${mission.title}`}
          className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
          to={`/noctis-team/mission/${mission.missionId}`}
        />
        <div className="grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-2 overflow-hidden">
          <div className="pointer-events-none min-w-0 overflow-hidden">
            <span className="block min-w-0 font-semibold text-sm leading-5 line-clamp-2 wrap-break-word">
              {mission.title}
            </span>
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
                  "focus-visible:opacity-100"
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
                "focus-visible:opacity-100"
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
  const initialView = initialMissionData?.status === "archived" ? "archived" : "active";
  const navigate = useNavigate();
  const params = useParams();
  const outputDetailMatch = useMatch("/noctis-team/mission/:id/output/:step/:taskId/:filename");
  const routeMissionId = params.id ?? null;
  const routeOutputStep = outputDetailMatch?.params.step ?? null;
  const routeOutputTaskId = outputDetailMatch?.params.taskId ?? null;
  const routeOutputFilename = outputDetailMatch?.params.filename ?? null;
  const effectiveMissionId = activeMissionId ?? routeMissionId;
  const outputDetailActive = hasMissionOutputDetailRoute({
    step: routeOutputStep,
    taskId: routeOutputTaskId,
    filename: routeOutputFilename,
  });

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
  const [missionView, setMissionView] = useState<"active" | "archived">(initialView);
  const [isLoadingMissions, setIsLoadingMissions] = useState(true);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [archiveMissionId, setArchiveMissionId] = useState<string | null>(null);
  const [bulkMissionDialog, setBulkMissionDialog] = useState<BulkMissionDialogState>(null);
  const [isBulkMissionActionPending, setIsBulkMissionActionPending] = useState(false);
  const [isRenamingMission, setIsRenamingMission] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("banter");
  const [missionOutputs, setMissionOutputs] = useState<MissionOutputSummary[]>([]);
  const [isLoadingMissionOutputs, setIsLoadingMissionOutputs] = useState(false);
  const [missionOutputsError, setMissionOutputsError] = useState<string | null>(null);
  const [missionDetail, setMissionDetail] = useState<MissionResumePayload | null>(initialMissionData ?? null);
  const [draftExecutionProjectId, setDraftExecutionProjectId] = useState<string | null>(
    initialMissionData?.executionProjectId ?? null,
  );
  const [draftContextProjectIds, setDraftContextProjectIds] = useState<string[]>(
    initialMissionData?.contextProjectIds ?? [],
  );
  const [isContextDialogOpen, setIsContextDialogOpen] = useState(false);
  const [isSavingContext, setIsSavingContext] = useState(false);
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false);
  const {
    data: projectRegistryData,
    error: projectRegistryError,
  } = useProjectRegistry();
  const availableProjects = projectRegistryData?.projects ?? [];
  const defaultExecutionProjectId = availableProjects[0]?.id ?? null;
  const effectiveExecutionProjectId =
    missionDetail?.executionProjectId ??
    draftExecutionProjectId ??
    (effectiveMissionId ? null : defaultExecutionProjectId);
  const effectiveContextProjectIds = useMemo(() => {
    const executionProjectId =
      missionDetail?.executionProjectId ?? effectiveExecutionProjectId ?? undefined;
    const sourceProjectIds = missionDetail?.contextProjectIds ?? draftContextProjectIds;

    return normalizeContextProjectIds(executionProjectId, sourceProjectIds);
  }, [
    draftContextProjectIds,
    effectiveExecutionProjectId,
    missionDetail?.contextProjectIds,
    missionDetail?.executionProjectId,
  ]);
  const contextProjects = useMemo(
    () =>
      effectiveContextProjectIds.map((projectId) => ({
        id: projectId,
        label: availableProjects.find((project) => project.id === projectId)?.displayName ?? projectId,
      })),
    [availableProjects, effectiveContextProjectIds],
  );
  const {
    messages,
    banterEntries,
    latestBanterEntryId,
    partyMembers,
    speakingAgentId,
    isSessionActive,
    isStreaming,
    isLoadingHistory,
    availableOperations,
    selectedOperation,
    activeOperationState,
    isOperationSelectionLocked,
    setSelectedOperation,
    send,
    abort,
  } = useAgentSession({
    activeMissionId: effectiveMissionId,
    language,
    initialMissionData,
    initialMessageInfos,
    selectedExecutionProjectId: effectiveExecutionProjectId,
    selectedContextProjectIds: effectiveContextProjectIds,
  });
  const currentOperationStep =
    activeOperationState?.currentStep ?? initialMissionData?.operationState?.currentStep ?? null;
  const selectedExecutionProject = availableProjects.find(
    (project) => project.id === effectiveExecutionProjectId,
  ) ?? null;
  const newMissionContextHint =
    "Context projects start empty for new missions.";
  const isLegacyMissionBlocked =
    Boolean(effectiveMissionId) && Boolean(missionDetail) && !missionDetail?.executionProjectId;
  const workspaceStatusLabel =
    missionDetail?.workspaceStatus === "ready"
      ? "Ready"
      : missionDetail?.workspaceStatus === "deleted"
        ? "Deleted"
        : missionDetail?.workspaceStatus === "missing"
          ? "Missing"
          : "Not provisioned";
  const missionActionLabel = isLegacyMissionBlocked ? "Assign Execution Project" : "Mission Details";
  const missionStatusAlert = isLegacyMissionBlocked
    ? {
        toneClassName: "border-amber-500/30 bg-amber-500/10 text-amber-100",
        message:
          "This legacy mission can be viewed, but it cannot resume until an execution project is assigned.",
        actionLabel: "Assign Execution Project",
      }
    : missionDetail?.workspaceStatus === "deleted"
      ? {
          toneClassName: "border-border/60 bg-card/40 text-muted-foreground",
          message: "Workspace deleted. Resume will recreate a fresh workspace and sessions.",
          actionLabel: "Mission Details",
        }
      : missionDetail?.workspaceStatus === "missing"
        ? {
            toneClassName: "border-border/60 bg-card/40 text-muted-foreground",
            message: "Workspace missing. Resume will recreate it from the persisted mission branch.",
            actionLabel: "Mission Details",
          }
        : null;
  const isWorkspaceDeleteDisabled =
    !effectiveMissionId ||
    !missionDetail?.workspacePath ||
    missionDetail.workspaceStatus !== "ready" ||
    isDeletingWorkspace ||
    isSessionActive ||
    isStreaming ||
    isLoadingHistory ||
    activeOperationState?.status === "running" ||
    activeOperationState?.status === "waiting_for_report";
  const selectedOutputKey =
    outputDetailActive && routeOutputStep && routeOutputTaskId && routeOutputFilename
      ? getMissionOutputKey({
          step: routeOutputStep,
          taskId: routeOutputTaskId,
          filename: routeOutputFilename,
        })
      : null;

  useEffect(() => {
    if (outputDetailActive) {
      setInspectorTab("outputs");
    }
  }, [outputDetailActive]);

  useEffect(() => {
    if (initialMissionData?.missionId === effectiveMissionId) {
      setMissionDetail(initialMissionData);
      return;
    }

    if (!effectiveMissionId) {
      setMissionDetail(null);
    }
  }, [effectiveMissionId, initialMissionData]);

  useEffect(() => {
    if (missionDetail?.executionProjectId) {
      setDraftExecutionProjectId(missionDetail.executionProjectId);
      return;
    }

    if (effectiveMissionId || draftExecutionProjectId || !defaultExecutionProjectId) {
      return;
    }

    setDraftExecutionProjectId(defaultExecutionProjectId);
  }, [
    defaultExecutionProjectId,
    draftExecutionProjectId,
    effectiveMissionId,
    missionDetail?.executionProjectId,
  ]);

  const resetMissionOutputsState = useCallback(() => {
    setMissionOutputs([]);
    setMissionOutputsError(null);
    setIsLoadingMissionOutputs(false);
  }, []);

  const loadMissions = useCallback(async () => {
    setIsLoadingMissions(true);
    try {
      const res = await fetch("/api/noctis/missions?view=all");
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

  const loadMissionOutputs = useCallback(async () => {
    if (!effectiveMissionId) {
      resetMissionOutputsState();
      return;
    }

    setIsLoadingMissionOutputs(true);
    setMissionOutputsError(null);
    try {
      const response = await fetch(`/api/missions/${effectiveMissionId}/outputs`);
      if (!response.ok) {
        throw new Error(`outputs failed: ${response.status}`);
      }

      const data = (await response.json()) as { error?: string; outputs?: MissionOutputSummary[] };
      if (data.error) {
        throw new Error(data.error);
      }

      setMissionOutputs(Array.isArray(data.outputs) ? data.outputs : []);
    } catch (error) {
      setMissionOutputs([]);
      setMissionOutputsError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingMissionOutputs(false);
    }
  }, [effectiveMissionId, resetMissionOutputsState]);

  const loadMissionDetail = useCallback(async () => {
    if (!effectiveMissionId) {
      setMissionDetail(null);
      return;
    }

    try {
      const response = await fetch(`/api/noctis/missions/${effectiveMissionId}`);
      if (!response.ok) {
        throw new Error(`mission failed: ${response.status}`);
      }

      const data = (await response.json()) as MissionResumePayload;
      setMissionDetail(data);
    } catch {
      setMissionDetail(null);
    }
  }, [effectiveMissionId]);

  useEffect(() => {
    void loadMissions();
  }, [loadMissions]);

  useEffect(() => {
    void loadMissionOutputs();
  }, [loadMissionOutputs]);

  useEffect(() => {
    void loadMissionDetail();
  }, [loadMissionDetail]);

  const selectedOutput = useMemo(
    () =>
      missionOutputs.find((output) => getMissionOutputKey(output) === selectedOutputKey) ?? null,
    [missionOutputs, selectedOutputKey],
  );

  const missionCounts = useMemo(() => {
    return missions.reduce(
      (counts, mission) => {
        if (mission.status === "archived") {
          counts.archived += 1;
        } else {
          counts.active += 1;
        }
        return counts;
      },
      { active: 0, archived: 0 }
    );
  }, [missions]);

  const visibleMissions = useMemo(
    () => missions.filter((mission) => (missionView === "archived" ? mission.status === "archived" : mission.status !== "archived")),
    [missionView, missions]
  );

  const actionableVisibleMissions = useMemo(
    () =>
      visibleMissions.filter((mission) => {
        if (missionView === "archived") {
          return true;
        }

        const isDisabled =
          effectiveMissionId === mission.missionId && (isSessionActive || isStreaming || isLoadingHistory);
        return !isDisabled;
      }),
    [effectiveMissionId, isLoadingHistory, isSessionActive, isStreaming, missionView, visibleMissions]
  );

  const skippedVisibleMissionCount = visibleMissions.length - actionableVisibleMissions.length;

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

  const submitMissionArchive = useCallback(
    async (
      mission: MissionSummary,
      action: "archive" | "restore",
      options?: { showUndo?: boolean; silent?: boolean }
    ) => {
      setArchiveMissionId(mission.missionId);
      try {
        const response = await fetch(`/api/noctis/missions/${mission.missionId}/archive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });

        if (!response.ok) {
          throw new Error("Failed to update mission archive state");
        }

        const data = (await response.json()) as {
          mission?: MissionSummary & { archivedAt?: string | null };
        };
        const updatedMission = data.mission;
        if (!updatedMission) {
          throw new Error("Missing mission in response");
        }

        setMissions((current) =>
          current.map((entry) =>
            entry.missionId === mission.missionId
              ? {
                  ...entry,
                  ...updatedMission,
                  archivedAt: updatedMission.archivedAt ?? null,
                }
              : entry
          )
        );
        setEditingMissionId(null);

        if (action === "archive" && effectiveMissionId === mission.missionId) {
          if (typeof window !== "undefined") {
            const storedMissionId = window.localStorage.getItem(LAST_MISSION_STORAGE_KEY);
            if (storedMissionId === mission.missionId) {
              window.localStorage.removeItem(LAST_MISSION_STORAGE_KEY);
            }
          }
          navigate("/noctis-team", { replace: true, state: { skipMissionRestore: true } });
        }

        if (!options?.silent) {
          toast.success(action === "archive" ? "Mission archived" : "Mission restored", {
            action:
              options?.showUndo === false
                ? undefined
                : {
                    label: "Undo",
                    onClick: () => {
                      void submitMissionArchive(
                        { ...mission, ...updatedMission },
                        action === "archive" ? "restore" : "archive",
                        { showUndo: false }
                      );
                    },
                  },
          });
        }
        return true;
      } catch {
        if (!options?.silent) {
          toast.error(action === "archive" ? "Unable to archive mission" : "Unable to restore mission", {
            description: "Mission metadata could not be updated.",
          });
        }
        return false;
      } finally {
        setArchiveMissionId(null);
      }
    },
    [effectiveMissionId, navigate]
  );

  const openBulkMissionDialog = useCallback((action: BulkMissionAction) => {
    setBulkMissionDialog({
      action,
      count: actionableVisibleMissions.length,
      skipped: skippedVisibleMissionCount,
    });
  }, [actionableVisibleMissions.length, skippedVisibleMissionCount]);

  const confirmBulkMissionAction = useCallback(async () => {
    if (!bulkMissionDialog) {
      return;
    }

    const targets = [...actionableVisibleMissions];
    setIsBulkMissionActionPending(true);
    setBulkMissionDialog(null);

    let successCount = 0;
    let failureCount = 0;
    for (const mission of targets) {
      const ok = await submitMissionArchive(mission, bulkMissionDialog.action, {
        showUndo: false,
        silent: true,
      });
      if (ok) {
        successCount += 1;
      } else {
        failureCount += 1;
      }
    }

    setIsBulkMissionActionPending(false);

    if (successCount === 0 && failureCount > 0) {
      toast.error(
        bulkMissionDialog.action === "archive"
          ? "Unable to archive visible missions"
          : "Unable to restore visible missions",
        {
          description: "No missions were updated.",
        }
      );
      return;
    }

    const verb = bulkMissionDialog.action === "archive" ? "Archived" : "Restored";
    const details = [
      `${verb} ${successCount} ${successCount === 1 ? "mission" : "missions"}.`,
      bulkMissionDialog.skipped > 0
        ? `Skipped ${bulkMissionDialog.skipped} active ${bulkMissionDialog.skipped === 1 ? "mission" : "missions"}.`
        : null,
      failureCount > 0
        ? `${failureCount} ${failureCount === 1 ? "update" : "updates"} failed.`
        : null,
    ]
      .filter(Boolean)
      .join(" ");

    toast.success(
      bulkMissionDialog.action === "archive" ? "Visible missions archived" : "Visible missions restored",
      {
        description: details,
      }
    );
  }, [actionableVisibleMissions, bulkMissionDialog, submitMissionArchive]);

  const handleSend = useCallback(
    async (parts: PromptPart[]) => {
      if (!effectiveMissionId && !draftExecutionProjectId) {
        toast.error("Select an execution project before starting a mission");
        return;
      }

      if (isLegacyMissionBlocked) {
        toast.error("Assign an execution project before resuming this legacy mission");
        setIsContextDialogOpen(true);
        return;
      }

      const missionId = await send(parts);
      if (!effectiveMissionId && missionId) {
        await loadMissions();
        navigate(`/noctis-team/mission/${missionId}`, { replace: true });
      }
    },
    [draftExecutionProjectId, effectiveMissionId, isLegacyMissionBlocked, loadMissions, navigate, send]
  );

  const openContextDialog = useCallback(() => {
    if (effectiveMissionId) {
      setDraftContextProjectIds(missionDetail?.contextProjectIds ?? []);
    } else if (!draftExecutionProjectId && defaultExecutionProjectId) {
      setDraftExecutionProjectId(defaultExecutionProjectId);
    }

    setIsContextDialogOpen(true);
  }, [
    defaultExecutionProjectId,
    draftExecutionProjectId,
    effectiveMissionId,
    missionDetail?.contextProjectIds,
  ]);

  const toggleDraftContextProjectId = useCallback((projectId: string) => {
    setDraftContextProjectIds((current) =>
      current.includes(projectId)
        ? current.filter((entry) => entry !== projectId)
        : [...current, projectId],
    );
  }, []);

  const saveMissionContext = useCallback(async () => {
    const executionProjectId = missionDetail?.executionProjectId ?? draftExecutionProjectId;
    if (!executionProjectId) {
      toast.error("Select an execution project before saving mission context");
      return;
    }

    const normalizedContextProjectIds = normalizeContextProjectIds(
      executionProjectId,
      draftContextProjectIds,
    );

    if (!effectiveMissionId) {
      setDraftExecutionProjectId(executionProjectId);
      setDraftContextProjectIds(normalizedContextProjectIds);
      setIsContextDialogOpen(false);
      toast.success("Mission context updated");
      return;
    }

    setIsSavingContext(true);
    try {
      const response = await fetch(`/api/noctis/missions/${effectiveMissionId}/context`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          executionProjectId,
          contextProjectIds: normalizedContextProjectIds,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? `context failed: ${response.status}`);
      }

      setDraftExecutionProjectId(executionProjectId);
      setIsContextDialogOpen(false);
      await Promise.all([loadMissionDetail(), loadMissions()]);
      toast.success(
        missionDetail?.executionProjectId ? "Mission context updated" : "Execution project assigned",
      );
    } catch (error) {
      toast.error("Unable to save mission context", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSavingContext(false);
    }
  }, [
    draftContextProjectIds,
    draftExecutionProjectId,
    effectiveMissionId,
    loadMissionDetail,
    loadMissions,
    missionDetail?.executionProjectId,
  ]);

  const deleteWorkspace = useCallback(async () => {
    if (!effectiveMissionId) {
      return;
    }

    setIsDeletingWorkspace(true);
    try {
      const response = await fetch(`/api/noctis/missions/${effectiveMissionId}/workspace`, {
        method: "DELETE",
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? `workspace failed: ${response.status}`);
      }

      await loadMissionDetail();
      toast.success("Workspace deleted");
    } catch (error) {
      toast.error("Unable to delete workspace", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsDeletingWorkspace(false);
    }
  }, [effectiveMissionId, loadMissionDetail]);

  const openWorkspaceFolder = useCallback(async () => {
    const workspacePath = missionDetail?.workspacePath;
    if (!workspacePath) {
      return;
    }

    try {
      const response = await fetch("/api/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: workspacePath }),
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error ?? `HTTP ${response.status}`);
      }
    } catch (error) {
      toast.error("Unable to open workspace folder", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [missionDetail?.workspacePath]);

  const openWorkspaceInVSCode = useCallback(async () => {
    const workspacePath = missionDetail?.workspacePath;
    if (!workspacePath) {
      return;
    }

    try {
      const response = await fetch("/api/open-vscode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: workspacePath,
          preference: "auto",
        }),
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error ?? `HTTP ${response.status}`);
      }
    } catch (error) {
      toast.error("Unable to open workspace in VS Code", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [missionDetail?.workspacePath]);

  const handleOpenOutputs = useCallback(() => {
    setInspectorTab("outputs");
  }, []);

  const handleSelectOutput = useCallback((output: MissionOutputSummary) => {
    if (!effectiveMissionId) {
      return;
    }

    setInspectorTab("outputs");
    navigate(buildMissionOutputDetailPath(effectiveMissionId, output));
  }, [effectiveMissionId, navigate]);

  const handleInspectorTabChange = useCallback(
    (value: string) => {
      if (value === "outputs") {
        setInspectorTab("outputs");
        return;
      }

      setInspectorTab("banter");
      if (outputDetailActive && effectiveMissionId) {
        navigate(buildMissionPath(effectiveMissionId));
      }
    },
    [effectiveMissionId, navigate, outputDetailActive],
  );

  const activeInspectorTab = resolveMissionInspectorTab(inspectorTab, outputDetailActive);

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden">
      <ResizablePanelGroup
        orientation="horizontal"
        className="relative h-full min-h-0 w-full overflow-hidden"
      >
        <ResizablePanel defaultSize={20}>
          <div className="flex h-full min-h-0 min-w-0 flex-col border-border/50 border-r bg-background/30 backdrop-blur-sm">
            <div className="w-full border-border/50 border-b p-3">
              <div className="mb-3 flex w-full items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-primary/80" />
                  <div>
                    <h2 className="font-semibold text-sm">Mission History</h2>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
                      Resume by mission
                    </p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={isBulkMissionActionPending || actionableVisibleMissions.length === 0}
                      title={
                        missionView === "archived"
                          ? "More restore actions"
                          : "More archive actions"
                      }
                    >
                      <Ellipsis className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onSelect={() => openBulkMissionDialog(missionView === "archived" ? "restore" : "archive") }>
                      {missionView === "archived"
                        ? `Restore all visible (${actionableVisibleMissions.length})`
                        : `Archive all visible (${actionableVisibleMissions.length})`}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
              <Tabs
                value={missionView}
                onValueChange={(value) => {
                  setEditingMissionId(null);
                  setMissionView(value === "archived" ? "archived" : "active");
                }}
              >
                <TabsList className="mt-3 grid h-auto w-full grid-cols-2 gap-1 rounded-lg bg-background/40 p-1">
                  <TabsTrigger
                    className="rounded-md px-2 py-1.5 text-[11px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    value="active"
                  >
                    Active ({missionCounts.active})
                  </TabsTrigger>
                  <TabsTrigger
                    className="rounded-md px-2 py-1.5 text-[11px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    value="archived"
                  >
                    Archived ({missionCounts.archived})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
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
                ) : visibleMissions.length === 0 ? (
                  <div className="rounded-lg border border-border/50 bg-card/40 p-3 font-mono text-[11px] text-muted-foreground/70">
                    {missionView === "archived" ? "No archived missions." : "No saved missions yet."}
                  </div>
                ) : (
                  visibleMissions.map((mission) => (
                    <MissionHistoryItem
                      key={mission.missionId}
                      mission={mission}
                      isActive={effectiveMissionId === mission.missionId}
                      isArchivedView={missionView === "archived"}
                      isEditing={editingMissionId === mission.missionId}
                      isArchivePending={archiveMissionId === mission.missionId || isBulkMissionActionPending}
                      isArchiveDisabled={
                        isBulkMissionActionPending ||
                        (missionView === "active" &&
                          effectiveMissionId === mission.missionId &&
                          (isSessionActive || isStreaming || isLoadingHistory))
                      }
                      isRenaming={isRenamingMission}
                      onBeginRename={beginRenameMission}
                      onArchiveAction={submitMissionArchive}
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
              showExecutionProjectSelector={!effectiveMissionId}
              executionProjectOptions={availableProjects.map((project) => ({
                value: project.id,
                label: project.displayName,
              }))}
              selectedExecutionProjectId={effectiveExecutionProjectId}
              executionProjectHint={newMissionContextHint}
              executionProjectError={projectRegistryError}
              onSelectedExecutionProjectChange={(projectId) => setDraftExecutionProjectId(projectId)}
              missionExecutionLabel={
                effectiveMissionId
                  ? selectedExecutionProject?.displayName ?? missionDetail?.executionProjectId ?? "Not assigned"
                  : null
              }
              contextProjects={contextProjects}
              contextActionLabel={!effectiveMissionId ? "Mission Context" : null}
              onContextAction={!effectiveMissionId ? openContextDialog : undefined}
              missionActionLabel={effectiveMissionId ? missionActionLabel : null}
              onMissionAction={effectiveMissionId ? openContextDialog : undefined}
              availableOperations={availableOperations}
              selectedOperation={selectedOperation}
              activeOperationState={activeOperationState}
              isOperationSelectionLocked={isOperationSelectionLocked}
              onSelectedOperationChange={setSelectedOperation}
              onAbort={abort}
              onSend={handleSend}
              showAbortAction={isSessionActive && !isLoadingHistory}
              outputCount={missionOutputs.length}
              onOpenOutputs={handleOpenOutputs}
            />
          </div>
        </ResizablePanel>

        <ResizablePanel defaultSize={30}>
          <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="shrink-0 border-border/50 border-b p-3">
              {missionStatusAlert ? (
                <div className={cn("mb-3 rounded-lg border p-2.5", missionStatusAlert.toneClassName)}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs">{missionStatusAlert.message}</p>
                    <Button type="button" variant="outline" size="sm" onClick={openContextDialog}>
                      {missionStatusAlert.actionLabel}
                    </Button>
                  </div>
                </div>
              ) : null}

              <PartyStatusPanel members={partyMembers} speakingAgentId={speakingAgentId} />
            </div>

            <Tabs
              className="flex min-h-0 flex-1 flex-col"
              value={activeInspectorTab}
              onValueChange={handleInspectorTabChange}
            >
              <div className="shrink-0 border-border/50 border-b px-3 pt-2">
                <TabsList className="w-full justify-start border-border/50" variant="line">
                  <TabsTrigger className="px-3" value="banter" variant="line">
                    Banter
                  </TabsTrigger>
                  <TabsTrigger className="px-3" value="outputs" variant="line">
                    Outputs ({missionOutputs.length})
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent className="mt-0 min-h-0 flex-1 overflow-hidden p-3" value="banter">
                <BanterLog
                  entries={effectiveMissionId ? banterEntries : []}
                  latestEntryId={effectiveMissionId ? latestBanterEntryId : null}
                />
              </TabsContent>

              <TabsContent className="mt-0 min-h-0 flex-1 overflow-hidden" value="outputs">
                <MissionOutputBrowser
                  currentStep={currentOperationStep}
                  isLoadingOutputs={isLoadingMissionOutputs}
                  onReload={() => {
                    void loadMissionOutputs();
                  }}
                  onSelectOutput={handleSelectOutput}
                  outputs={missionOutputs}
                  outputsError={missionOutputsError}
                  selectedOutput={selectedOutput}
                />
              </TabsContent>
            </Tabs>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      <Dialog open={bulkMissionDialog !== null} onOpenChange={(open) => (!open ? setBulkMissionDialog(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkMissionDialog?.action === "archive"
                ? "Archive visible missions?"
                : "Restore visible missions?"}
            </DialogTitle>
            <DialogDescription>
              {bulkMissionDialog?.action === "archive"
                ? `${bulkMissionDialog?.count ?? 0} visible missions will be archived.`
                : `${bulkMissionDialog?.count ?? 0} visible missions will be restored.`}
              {bulkMissionDialog && bulkMissionDialog.skipped > 0
                ? ` ${bulkMissionDialog.skipped} active ${bulkMissionDialog.skipped === 1 ? "mission" : "missions"} will be skipped.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkMissionDialog(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void confirmBulkMissionAction()}>
              {bulkMissionDialog?.action === "archive" ? "Archive visible" : "Restore visible"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isContextDialogOpen} onOpenChange={setIsContextDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {effectiveMissionId
                ? missionDetail?.executionProjectId
                  ? "Mission details"
                  : "Assign execution project"
                : "Mission context"}
            </DialogTitle>
            <DialogDescription>
              {effectiveMissionId
                ? "Review execution workspace details and manage mission-specific context."
                : "Choose the writable execution project once, then manage secondary context projects for future prompts."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!missionDetail?.executionProjectId ? (
              <div className="space-y-2">
                <p className="font-medium text-sm">Execution project</p>
                <Select
                  value={draftExecutionProjectId ?? undefined}
                  onValueChange={(value) => setDraftExecutionProjectId(value || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="font-medium text-sm">Execution project</p>
                <p className="text-muted-foreground text-sm">
                  {selectedExecutionProject?.displayName ?? missionDetail.executionProjectId}
                </p>
              </div>
            )}

            {effectiveMissionId ? (
              <div className="space-y-1.5">
                <p className="font-medium text-sm">Workspace</p>
                <p className="text-muted-foreground text-sm">{workspaceStatusLabel}</p>
                <p className="break-all font-mono text-[11px] text-muted-foreground/75">
                  {missionDetail?.workspacePath ?? "No workspace provisioned yet."}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void openWorkspaceFolder()}
                    disabled={!missionDetail?.workspacePath || missionDetail.workspaceStatus !== "ready"}
                  >
                    Open Folder
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void openWorkspaceInVSCode()}
                    disabled={!missionDetail?.workspacePath || missionDetail.workspaceStatus !== "ready"}
                  >
                    Open VS Code
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="font-medium text-sm">Context projects</p>
              <div className="flex flex-wrap gap-2.5">
                {availableProjects
                  .filter((project) => project.id !== (missionDetail?.executionProjectId ?? draftExecutionProjectId))
                  .map((project) => {
                    const selected = draftContextProjectIds.includes(project.id);
                    return (
                      <Button
                        key={project.id}
                        type="button"
                        aria-pressed={selected}
                        className={cn(
                          "rounded-full px-4",
                          selected
                            ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                            : "bg-background/70 text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                        )}
                        variant="outline"
                        size="sm"
                        onClick={() => toggleDraftContextProjectId(project.id)}
                      >
                        {project.displayName}
                      </Button>
                    );
                  })}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 border-border/50 border-t pt-4">
            {effectiveMissionId ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void deleteWorkspace()}
                disabled={isWorkspaceDeleteDisabled}
              >
                Delete Workspace
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setIsContextDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveMissionContext()} disabled={isSavingContext}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

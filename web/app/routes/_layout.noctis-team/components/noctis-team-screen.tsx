import { Archive, Check, Ellipsis, History, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useMatch, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { WorkspaceLaunchActions } from "@/components/workspace-launch-actions";
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
import { useVSCodePreferences } from "@/hooks/use-vscode-preferences";
import type { AppLanguage } from "@/lib/app-language.server";
import { normalizeContextProjectIds } from "@/lib/execution-context";
import {
  DEFAULT_NEW_MISSION_EXECUTION_TARGET_MODE,
  getMissionExecutionTargetModeLabel,
  normalizeMissionExecutionTargetMode,
} from "@/lib/mission-execution-target-mode";
import { getMissionSurface } from "@/lib/mission-surface";
import {
  clearMissionSurfaceNewMissionDraft,
  readMissionSurfaceNewMissionDraft,
  writeMissionSurfaceNewMissionDraft,
} from "@/lib/noctis-team-new-mission-draft";
import type {
  MissionExecutionTargetMode,
  MissionOutputSummary,
  MissionSurfaceId,
} from "@/lib/types/mission";
import { cn } from "@/lib/utils";
import type { PromptPart } from "@/lib/prompt-parts";
import type { MessageInfo } from "@/routes/_layout.opencode.session.$id/types";
import { BanterLog } from "./banter-log";
import { ChatArea } from "./chat-area";
import { LunafreyaStatusPanel, type LunafreyaFacetOption } from "./lunafreya-status-panel";
import { MissionActivityLog } from "./mission-activity-log";
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

type BulkMissionAction = "archive" | "restore";

type BulkMissionDialogState = {
  action: BulkMissionAction;
  count: number;
  skipped: number;
} | null;

type InspectorTab = "banter" | "activity" | "outputs";

type MissionHistoryItemProps = {
  mission: MissionSummary;
  routeBase: string;
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
    routeBase,
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
          to={buildMissionPath(mission.missionId, routeBase)}
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
  surfaceId?: MissionSurfaceId;
  language?: AppLanguage;
  initialMissionData?: MissionResumePayload | null;
  initialMessageInfos?: MessageInfo[] | null;
}

export function NoctisTeamScreen({
  activeMissionId,
  surfaceId: requestedSurfaceId,
  language = "other",
  initialMissionData,
  initialMessageInfos,
}: NoctisTeamScreenProps) {
  const surface = getMissionSurface(
    requestedSurfaceId ??
      (initialMissionData?.surfaceId === "lunafreya" ? "lunafreya" : "noctis_team"),
  );
  const isLunafreyaSurface = surface.id === "lunafreya";
  const missionRouteBase = surface.routeBase;
  const missionApiBase = isLunafreyaSurface ? "/api/lunafreya/missions" : "/api/noctis/missions";
  const primaryAgentId = surface.primaryAgentId;
  const primaryAgentLabel = primaryAgentId === "lunafreya" ? "Lunafreya" : "Noctis";
  const initialView = initialMissionData?.status === "archived" ? "archived" : "active";
  const navigate = useNavigate();
  const params = useParams();
  const outputDetailMatch = useMatch(
    `${missionRouteBase}/mission/:id/output/:step/:taskId/:filename`,
  );
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

    window.localStorage.setItem(surface.lastMissionStorageKey, effectiveMissionId);
  }, [effectiveMissionId, surface.lastMissionStorageKey]);

  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [missionView, setMissionView] = useState<"active" | "archived">(initialView);
  const [isLoadingMissions, setIsLoadingMissions] = useState(true);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [archiveMissionId, setArchiveMissionId] = useState<string | null>(null);
  const [bulkMissionDialog, setBulkMissionDialog] = useState<BulkMissionDialogState>(null);
  const [isBulkMissionActionPending, setIsBulkMissionActionPending] = useState(false);
  const [isRenamingMission, setIsRenamingMission] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>(
    surface.supportsBanter ? "banter" : "activity",
  );
  const [missionOutputs, setMissionOutputs] = useState<MissionOutputSummary[]>([]);
  const [isLoadingMissionOutputs, setIsLoadingMissionOutputs] = useState(false);
  const [missionOutputsError, setMissionOutputsError] = useState<string | null>(null);
  const [missionDetail, setMissionDetail] = useState<MissionResumePayload | null>(initialMissionData ?? null);
  const [draftExecutionProjectId, setDraftExecutionProjectId] = useState<string | null>(
    initialMissionData?.executionProjectId ?? null,
  );
  const [draftExecutionTargetMode, setDraftExecutionTargetMode] = useState<MissionExecutionTargetMode>(
    initialMissionData
      ? (normalizeMissionExecutionTargetMode(
          initialMissionData.executionTargetMode ?? undefined,
          initialMissionData.executionProjectId ?? undefined,
        ) ?? "mission_workspace")
      : DEFAULT_NEW_MISSION_EXECUTION_TARGET_MODE,
  );
  const [draftContextProjectIds, setDraftContextProjectIds] = useState<string[]>(
    initialMissionData?.contextProjectIds ?? [],
  );
  const [hasLoadedDraftState, setHasLoadedDraftState] = useState(false);
  const [isContextDialogOpen, setIsContextDialogOpen] = useState(false);
  const [isDeleteWorkspaceDialogOpen, setIsDeleteWorkspaceDialogOpen] = useState(false);
  const [isSavingContext, setIsSavingContext] = useState(false);
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false);
  const [lunafreyaJobOptions, setLunafreyaJobOptions] = useState<LunafreyaFacetOption[]>([]);
  const [lunafreyaKnowledgeOptions, setLunafreyaKnowledgeOptions] = useState<LunafreyaFacetOption[]>([]);
  const [selectedLunafreyaJobId, setSelectedLunafreyaJobId] = useState<string | null>(
    initialMissionData?.lunafreyaFacetSelection?.selectedJobId ?? null,
  );
  const [selectedLunafreyaKnowledgeIds, setSelectedLunafreyaKnowledgeIds] = useState<string[]>(
    initialMissionData?.lunafreyaFacetSelection?.selectedKnowledgeIds ?? [],
  );
  const {
    data: projectRegistryData,
    error: projectRegistryError,
  } = useProjectRegistry();
  const { vscodePreferences, updateVSCodePreference } = useVSCodePreferences();
  const availableProjects = projectRegistryData?.projects ?? [];
  const defaultExecutionProjectId = availableProjects[0]?.id ?? null;
  const effectiveExecutionTargetMode =
    normalizeMissionExecutionTargetMode(
      missionDetail?.executionTargetMode ?? undefined,
      missionDetail?.executionProjectId ?? undefined,
    ) ?? draftExecutionTargetMode;
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
    isStartingMission,
    isSessionActive,
    isStreaming,
    isLoadingHistory,
    availableOperations,
    selectedOperation,
    activeOperationState,
    workflowProgress,
    activityLog,
    primaryContextUsage,
    isOperationSelectionLocked,
    setSelectedOperation,
    send,
    abort,
  } = useAgentSession({
    activeMissionId: effectiveMissionId,
    surfaceId: surface.id,
    language,
    initialMissionData,
    initialMessageInfos,
    selectedExecutionProjectId: effectiveExecutionProjectId,
    selectedExecutionTargetMode: effectiveExecutionTargetMode,
    selectedContextProjectIds: effectiveContextProjectIds,
    selectedLunafreyaJobId,
    selectedLunafreyaKnowledgeIds,
  });
  const isMissionStartPending = !effectiveMissionId && isStartingMission;
  const currentOperationStep =
    activeOperationState?.currentStep ?? initialMissionData?.operationState?.currentStep ?? null;
  const effectiveWorkflowProgress =
    workflowProgress ?? missionDetail?.workflowProgress ?? initialMissionData?.workflowProgress ?? null;
  const selectedExecutionProject = availableProjects.find(
    (project) => project.id === effectiveExecutionProjectId,
  ) ?? null;
  const missionExecutionTargetMode = normalizeMissionExecutionTargetMode(
    missionDetail?.executionTargetMode ?? undefined,
    missionDetail?.executionProjectId ?? undefined,
  );
  const isDirectExecutionMission = missionExecutionTargetMode === "execution_project";
  const workspaceLaunchPreferenceKey =
    missionDetail?.executionProjectId ?? effectiveExecutionProjectId ?? missionDetail?.workspacePath ?? null;
  const workspaceVSCodePreference = workspaceLaunchPreferenceKey
    ? (vscodePreferences[workspaceLaunchPreferenceKey] ?? "auto")
    : "auto";
  const newMissionContextHint =
    "Context projects start empty for new missions.";
  const isLegacyMissionBlocked =
    Boolean(effectiveMissionId) && Boolean(missionDetail) && !missionDetail?.executionProjectId;
  const workspaceStatusLabel =
    isDirectExecutionMission
      ? "Registered project"
      : missionDetail?.workspaceStatus === "ready"
        ? "Ready"
        : missionDetail?.workspaceStatus === "deleted"
          ? "Deleted"
          : missionDetail?.workspaceStatus === "missing"
            ? "Missing"
            : "Not provisioned";
  const displayedWorkspacePath = isDirectExecutionMission
    ? selectedExecutionProject?.path ?? null
    : missionDetail?.workspacePath ?? null;
  const missionActionLabel = isLegacyMissionBlocked ? "Assign Execution Project" : "Mission Details";
  const missionStatusAlert = isLegacyMissionBlocked
    ? {
        toneClassName: "border-amber-500/30 bg-amber-500/10 text-amber-100",
        message:
          "This legacy mission can be viewed, but it cannot resume until an execution project is assigned.",
        actionLabel: "Assign Execution Project",
      }
    : !isDirectExecutionMission && missionDetail?.workspaceStatus === "deleted"
      ? {
          toneClassName: "border-border/60 bg-card/40 text-muted-foreground",
          message: "Workspace deleted. Resume will recreate a fresh workspace and sessions.",
          actionLabel: "Mission Details",
        }
      : !isDirectExecutionMission && missionDetail?.workspaceStatus === "missing"
        ? {
            toneClassName: "border-border/60 bg-card/40 text-muted-foreground",
            message: "Workspace missing. Resume will recreate it from the persisted mission branch.",
            actionLabel: "Mission Details",
          }
        : null;
  const isWorkspaceDeleteDisabled =
    isDirectExecutionMission ||
    !effectiveMissionId ||
    !missionDetail?.workspacePath ||
    missionDetail.workspaceStatus !== "ready" ||
    isDeletingWorkspace;
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
    if (typeof window === "undefined") {
      setHasLoadedDraftState(true);
      return;
    }

    if (effectiveMissionId) {
      setHasLoadedDraftState(true);
      return;
    }

    try {
      const draft = readMissionSurfaceNewMissionDraft(window.localStorage, surface.id);
      if (!draft) {
        return;
      }

      setDraftExecutionProjectId(draft.executionProjectId);
      setDraftExecutionTargetMode(draft.executionTargetMode);
      setDraftContextProjectIds(draft.contextProjectIds);
    } catch {
      clearMissionSurfaceNewMissionDraft(window.localStorage, surface.id);
    } finally {
      setHasLoadedDraftState(true);
    }
  }, [effectiveMissionId, surface.id]);

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
      setDraftExecutionTargetMode(
        normalizeMissionExecutionTargetMode(
          missionDetail.executionTargetMode ?? undefined,
          missionDetail.executionProjectId,
        ) ?? "mission_workspace",
      );
      return;
    }

    if (!hasLoadedDraftState) {
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
    hasLoadedDraftState,
    missionDetail?.executionTargetMode,
    missionDetail?.executionProjectId,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || effectiveMissionId || !hasLoadedDraftState) {
      return;
    }

    writeMissionSurfaceNewMissionDraft(window.localStorage, surface.id, {
      executionProjectId: draftExecutionProjectId,
      executionTargetMode: draftExecutionTargetMode,
      contextProjectIds: draftContextProjectIds,
    });
  }, [
    draftContextProjectIds,
    draftExecutionProjectId,
    draftExecutionTargetMode,
    effectiveMissionId,
    hasLoadedDraftState,
    surface.id,
  ]);

  useEffect(() => {
    if (!isLunafreyaSurface) {
      setLunafreyaJobOptions([]);
      setLunafreyaKnowledgeOptions([]);
      return;
    }

    let cancelled = false;

    const loadLunafreyaFacets = async () => {
      try {
        const query = effectiveExecutionProjectId
          ? `?executionProjectId=${encodeURIComponent(effectiveExecutionProjectId)}`
          : "";
        const response = await fetch(`/api/lunafreya/facets${query}`);
        if (!response.ok) {
          throw new Error(`facets failed: ${response.status}`);
        }

        const data = (await response.json()) as {
          jobs?: LunafreyaFacetOption[];
          knowledge?: LunafreyaFacetOption[];
        };
        if (cancelled) {
          return;
        }

        setLunafreyaJobOptions(Array.isArray(data.jobs) ? data.jobs : []);
        setLunafreyaKnowledgeOptions(Array.isArray(data.knowledge) ? data.knowledge : []);
      } catch {
        if (!cancelled) {
          setLunafreyaJobOptions([]);
          setLunafreyaKnowledgeOptions([]);
        }
      }
    };

    void loadLunafreyaFacets();

    return () => {
      cancelled = true;
    };
  }, [effectiveExecutionProjectId, isLunafreyaSurface]);

  useEffect(() => {
    if (!isLunafreyaSurface) {
      return;
    }

    if (!effectiveMissionId) {
      setSelectedLunafreyaJobId(null);
      setSelectedLunafreyaKnowledgeIds([]);
      return;
    }

    const selection =
      missionDetail?.lunafreyaFacetSelection ?? initialMissionData?.lunafreyaFacetSelection ?? null;
    setSelectedLunafreyaJobId(selection?.selectedJobId ?? null);
    setSelectedLunafreyaKnowledgeIds(selection?.selectedKnowledgeIds ?? []);
  }, [
    effectiveMissionId,
    initialMissionData?.lunafreyaFacetSelection,
    isLunafreyaSurface,
    missionDetail?.lunafreyaFacetSelection,
  ]);

  const resetMissionOutputsState = useCallback(() => {
    setMissionOutputs([]);
    setMissionOutputsError(null);
    setIsLoadingMissionOutputs(false);
  }, []);

  const loadMissions = useCallback(async () => {
    setIsLoadingMissions(true);
    try {
      const res = await fetch(`${missionApiBase}?view=all`);
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
  }, [missionApiBase]);

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
      const response = await fetch(`${missionApiBase}/${effectiveMissionId}`);
      if (!response.ok) {
        throw new Error(`mission failed: ${response.status}`);
      }

      const data = (await response.json()) as MissionResumePayload;
      setMissionDetail(data);
    } catch {
      setMissionDetail(null);
    }
  }, [effectiveMissionId, missionApiBase]);

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
      const response = await fetch(`${missionApiBase}/${missionId}/rename`, {
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
  }, [missionApiBase]);

  const submitMissionArchive = useCallback(
    async (
      mission: MissionSummary,
      action: "archive" | "restore",
      options?: { showUndo?: boolean; silent?: boolean }
    ) => {
      setArchiveMissionId(mission.missionId);
      try {
        const response = await fetch(`${missionApiBase}/${mission.missionId}/archive`, {
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
            const storedMissionId = window.localStorage.getItem(surface.lastMissionStorageKey);
            if (storedMissionId === mission.missionId) {
              window.localStorage.removeItem(surface.lastMissionStorageKey);
            }
          }
          navigate(missionRouteBase, { replace: true, state: { skipMissionRestore: true } });
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
    [effectiveMissionId, missionApiBase, missionRouteBase, navigate, surface.lastMissionStorageKey]
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
        if (typeof window !== "undefined") {
          clearMissionSurfaceNewMissionDraft(window.localStorage, surface.id);
        }
        await loadMissions();
        navigate(buildMissionPath(missionId, missionRouteBase), { replace: true });
      }
    },
    [
      draftExecutionProjectId,
      effectiveMissionId,
      isLegacyMissionBlocked,
      loadMissions,
      missionRouteBase,
      navigate,
      send,
      surface.id,
    ]
  );

  const toggleLunafreyaKnowledgeId = useCallback((knowledgeId: string) => {
    setSelectedLunafreyaKnowledgeIds((current) =>
      current.includes(knowledgeId)
        ? current.filter((entry) => entry !== knowledgeId)
        : [...current, knowledgeId],
    );
  }, []);

  const clearLunafreyaKnowledgeIds = useCallback(() => {
    setSelectedLunafreyaKnowledgeIds([]);
  }, []);

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
      const response = await fetch(`${missionApiBase}/${effectiveMissionId}/context`, {
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
    missionApiBase,
    missionDetail?.executionProjectId,
  ]);

  const deleteWorkspace = useCallback(async () => {
    if (!effectiveMissionId) {
      return;
    }

    setIsDeletingWorkspace(true);
    try {
      const response = await fetch(`${missionApiBase}/${effectiveMissionId}/workspace`, {
        method: "DELETE",
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? `workspace failed: ${response.status}`);
      }

      await loadMissionDetail();
      await loadMissions();
      setIsDeleteWorkspaceDialogOpen(false);
      toast.success("Workspace deleted");
    } catch (error) {
      toast.error("Unable to delete workspace", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsDeletingWorkspace(false);
    }
  }, [effectiveMissionId, loadMissionDetail, loadMissions, missionApiBase]);

  const handleSelectOutput = useCallback((output: MissionOutputSummary) => {
    if (!effectiveMissionId) {
      return;
    }

    setInspectorTab("outputs");
    navigate(buildMissionOutputDetailPath(effectiveMissionId, output, missionRouteBase));
  }, [effectiveMissionId, missionRouteBase, navigate]);

  const handleInspectorTabChange = useCallback(
    (value: string) => {
      if (value === "outputs") {
        setInspectorTab("outputs");
        return;
      }

      setInspectorTab(value === "activity" ? "activity" : "banter");
      if (outputDetailActive && effectiveMissionId) {
        navigate(buildMissionPath(effectiveMissionId, missionRouteBase));
      }
    },
    [effectiveMissionId, missionRouteBase, navigate, outputDetailActive],
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
                onClick={() => navigate(missionRouteBase, { state: { skipMissionRestore: true } })}
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
                      routeBase={missionRouteBase}
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
              isResponding={isMissionStartPending || isSessionActive || isLoadingHistory}
              isStartingMission={isMissionStartPending}
              isSessionActive={isSessionActive}
              isStreaming={isStreaming}
              messages={messages}
              showExecutionProjectSelector={!effectiveMissionId}
              executionProjectOptions={availableProjects.map((project) => ({
                value: project.id,
                label: project.displayName,
              }))}
              selectedExecutionProjectId={effectiveExecutionProjectId}
              selectedExecutionTargetMode={effectiveExecutionTargetMode}
              executionProjectHint={newMissionContextHint}
              executionProjectError={projectRegistryError}
              onSelectedExecutionProjectChange={(projectId) => setDraftExecutionProjectId(projectId)}
              onSelectedExecutionTargetModeChange={
                !effectiveMissionId ? setDraftExecutionTargetMode : undefined
              }
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
              workflowProgress={effectiveWorkflowProgress}
              isOperationSelectionLocked={isOperationSelectionLocked}
              onSelectedOperationChange={setSelectedOperation}
              onAbort={abort}
              onSend={handleSend}
              showAbortAction={isSessionActive && !isLoadingHistory && !isMissionStartPending}
              showWorkflowSelector={surface.supportsWorkflowSelector}
              headerTitle={
                isLunafreyaSurface ? "Oracle Mission Surface" : "Regalia Command Center"
              }
              headerSubtitle={
                isLunafreyaSurface
                  ? "Lunafreya Nox Fleuret - Direct Line"
                  : "Noctis Lucis Caelum - Direct Line"
              }
              primaryAgentId={primaryAgentId}
              primaryAgentAvatarSrc={surface.portraitSrc}
              primaryAgentLabel={primaryAgentLabel}
              composerStatusLabel={isLunafreyaSurface ? "Solo mission surface" : null}
              composerPlaceholder={`Send a message to ${primaryAgentLabel}`}
              startingMissionDescription={`Preparing mission and briefing ${primaryAgentLabel}.`}
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

              {surface.supportsPartyStatus ? (
                <PartyStatusPanel members={partyMembers} speakingAgentId={speakingAgentId} />
              ) : (
                <LunafreyaStatusPanel
                  contextUsage={primaryContextUsage}
                  isSpeaking={isStreaming || speakingAgentId === primaryAgentId}
                  jobOptions={lunafreyaJobOptions}
                  knowledgeOptions={lunafreyaKnowledgeOptions}
                  onClearKnowledgeIds={clearLunafreyaKnowledgeIds}
                  onSelectedJobIdChange={setSelectedLunafreyaJobId}
                  onToggleKnowledgeId={toggleLunafreyaKnowledgeId}
                  selectedJobId={selectedLunafreyaJobId}
                  selectedKnowledgeIds={selectedLunafreyaKnowledgeIds}
                  status={isSessionActive || isStreaming ? "working" : "idle"}
                />
              )}
            </div>

            <Tabs
              className="flex min-h-0 flex-1 flex-col"
              value={activeInspectorTab}
              onValueChange={handleInspectorTabChange}
            >
              <div className="shrink-0 border-border/50 border-b px-3 pt-2">
                <TabsList className="w-full justify-start border-border/50" variant="line">
                  {surface.supportsBanter ? (
                    <TabsTrigger className="px-3" value="banter" variant="line">
                      Banter
                    </TabsTrigger>
                  ) : (
                    <TabsTrigger className="px-3" value="activity" variant="line">
                      Activity
                    </TabsTrigger>
                  )}
                  <TabsTrigger className="px-3" value="outputs" variant="line">
                    Outputs ({missionOutputs.length})
                  </TabsTrigger>
                </TabsList>
              </div>

              {surface.supportsBanter ? (
                <TabsContent className="mt-0 min-h-0 flex-1 overflow-hidden p-3" value="banter">
                  <BanterLog
                    entries={effectiveMissionId ? banterEntries : []}
                    latestEntryId={effectiveMissionId ? latestBanterEntryId : null}
                  />
                </TabsContent>
              ) : (
                <TabsContent className="mt-0 min-h-0 flex-1 overflow-hidden" value="activity">
                  <MissionActivityLog entries={effectiveMissionId ? activityLog : []} />
                </TabsContent>
              )}

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
              <div className="space-y-1">
                <p className="font-medium text-sm">Execution mode</p>
                <p className="text-muted-foreground text-sm">
                  {getMissionExecutionTargetModeLabel(missionExecutionTargetMode)}
                </p>
              </div>
            ) : null}

            {effectiveMissionId ? (
              <div className="space-y-1.5">
                <p className="font-medium text-sm">Workspace</p>
                <p className="text-muted-foreground text-sm">{workspaceStatusLabel}</p>
                <p className="break-all font-mono text-[11px] text-muted-foreground/75">
                  {displayedWorkspacePath ?? "No workspace provisioned yet."}
                </p>
                {isDirectExecutionMission ? (
                  <p className="text-xs text-muted-foreground/75">
                    This mission is using the execution project directly without a dedicated workspace.
                  </p>
                ) : null}
                {displayedWorkspacePath ? (
                  <WorkspaceLaunchActions
                    className="pt-1"
                    disabled={!isDirectExecutionMission && missionDetail?.workspaceStatus !== "ready"}
                    path={displayedWorkspacePath}
                    vscodePreference={workspaceVSCodePreference}
                    onVSCodePreferenceChange={(preference) => {
                      if (!workspaceLaunchPreferenceKey) {
                        return;
                      }

                      updateVSCodePreference(workspaceLaunchPreferenceKey, preference);
                    }}
                  />
                ) : null}
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
            {effectiveMissionId && !isDirectExecutionMission ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsContextDialogOpen(false);
                  setIsDeleteWorkspaceDialogOpen(true);
                }}
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

      <Dialog
        open={isDeleteWorkspaceDialogOpen}
        onOpenChange={(open) => {
          if (!isDeletingWorkspace) {
            setIsDeleteWorkspaceDialogOpen(open);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workspace?</DialogTitle>
            <DialogDescription>
              This permanently deletes the execution workspace for this mission. Any uncommitted
              changes in the workspace will be discarded, and active mission sessions will be
              aborted when possible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 border-border/50 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteWorkspaceDialogOpen(false)}
              disabled={isDeletingWorkspace}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void deleteWorkspace()}
              disabled={isDeletingWorkspace}
            >
              {isDeletingWorkspace ? "Deleting..." : "Delete Workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

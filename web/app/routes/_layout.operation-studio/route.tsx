import { Bot, RefreshCw, Send, Settings2, Sparkles, Wrench } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { FlowBrowserPane } from "@/components/operation-studio/flow-browser-pane";
import { IrisAuthoringSheet } from "@/components/operation-studio/iris-authoring-sheet";
import { OperationListPane } from "@/components/operation-studio/operation-list-pane";
import { PreviewInputsSheet } from "@/components/operation-studio/preview-inputs-sheet";
import { PreviewTabs } from "@/components/operation-studio/preview-tabs";
import { PageContainer } from "@/components/page-container";
import { useSessionChatRenderSnapshot } from "@/hooks/use-session-chat-render-snapshot";
import { useSessionStatusFeed } from "@/hooks/use-session-status-feed";
import { useChatStore } from "@/stores/chat-store";
import { APP_ROOT_EXECUTION_PROJECT_ID } from "@/lib/execution-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ProjectEntry } from "@/lib/project-config.server";
import { readRegisteredProjects } from "@/lib/project-config.server";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { WORKING_PARTY_MEMBER_IDS } from "@/lib/noctis-working-party";
import type { PreviewPartyMode } from "@/lib/operation-debug/debug-preview.server";
import type { OperationDefinition } from "@/lib/operation-definition/types";
import {
  listOperationStudioOperationOptions,
  resolveOperationStudioLunafreyaFacetCatalog,
} from "@/lib/operation-studio/catalog.server";
import { parseOperationStudioAuthoringTarget } from "@/lib/operation-studio/authoring-target";
import {
  loadOperationStudioDrafts,
  persistOperationStudioDrafts,
  removeOperationStudioDraft,
  replaceOperationStudioDraft,
  type OperationStudioDraftRecord,
} from "@/lib/operation-studio/draft-store";
import { prependOperationStudioIrisContext } from "@/lib/operation-studio/iris-prompt";
import {
  buildOperationStudioIrisContextKey,
  loadOperationStudioIrisSessionState,
  persistOperationStudioIrisSessionState,
  shouldPromptForOperationStudioIrisReset,
  startNewOperationStudioIrisSession,
  type OperationStudioIrisSessionState,
} from "@/lib/operation-studio/iris-session";
import { buildOperationStudioPreviewBundle } from "@/lib/operation-studio/preview-engine.server";
import type { OperationOption } from "@/lib/operation-presentation";
import { PROJECT_SCOPE_LABELS, type ProjectScope } from "@/lib/project-scopes";
import type { PromptPart } from "@/lib/prompt-parts";
import { toSessionPresentationMessages } from "@/lib/session-message-presentation";
import { isSessionStatusActive } from "@/lib/session-status";
import type { ModelSelection, WorkerAgentId } from "@/lib/types/mission";
import type { MessageInfo } from "@/routes/_layout.opencode.session.$id/types";
import type { Route } from "./+types/route";

const PREVIEW_WORKER_LABELS: Record<WorkerAgentId, string> = {
  ignis: "Ignis",
  gladiolus: "Gladiolus",
  prompto: "Prompto",
};

function isPreviewPartyMode(value: string | null): value is PreviewPartyMode {
  return value === "full" || value === "solo" || value === "custom";
}

function isProjectScope(value: string | null): value is ProjectScope {
  return value === "noctis_team" || value === "lunafreya";
}

function parsePreviewWorkers(raw: string | null): WorkerAgentId[] {
  if (!raw?.trim()) {
    return [];
  }

  const seen = new Set<WorkerAgentId>();
  const workers: WorkerAgentId[] = [];
  for (const token of raw.split(",")) {
    const value = token.trim();
    if (
      (value === "ignis" || value === "gladiolus" || value === "prompto") &&
      !seen.has(value)
    ) {
      seen.add(value);
      workers.push(value);
    }
  }

  return workers;
}

function parseSelectionList(raw: string | null): string[] {
  if (!raw?.trim()) {
    return [];
  }

  const seen = new Set<string>();
  const values: string[] = [];
  for (const token of raw.split(",")) {
    const value = token.trim();
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    values.push(value);
  }

  return values;
}

function resolvePreviewWorkers(
  partyMode: PreviewPartyMode,
  requestedWorkers: WorkerAgentId[],
): WorkerAgentId[] {
  if (partyMode === "solo") {
    return [];
  }

  if (partyMode === "custom") {
    return requestedWorkers;
  }

  return [...WORKING_PARTY_MEMBER_IDS];
}

function formatPreviewPartySummary(previewWorkers: WorkerAgentId[]): string {
  if (previewWorkers.length === 0) {
    return "Solo preview · No delegation available";
  }

  if (previewWorkers.length === WORKING_PARTY_MEMBER_IDS.length) {
    return "Full party preview · All workers available";
  }

  return `Custom preview · ${previewWorkers.map((worker) => PREVIEW_WORKER_LABELS[worker]).join(", ")}`;
}

function operationSupportsDelegationPreview(operation?: OperationDefinition | null): boolean {
  return operation?.steps.some((step) => step.agent === "noctis" && Boolean(step.delegation)) ?? false;
}

function operationNeedsWorkerTaskSeed(operation?: OperationDefinition | null): boolean {
  return (
    operation?.steps.some(
      (step) =>
        step.agent === "ignis" ||
        step.agent === "gladiolus" ||
        step.agent === "prompto" ||
        Boolean(step.delegation),
    ) ?? false
  );
}

function resolveOperationStudioIrisExecutionContext(targetValue: string): {
  contextProjectIds: string[];
  executionProjectId: string;
} {
  const target = parseOperationStudioAuthoringTarget(targetValue);
  if (target.kind === "project") {
    return {
      contextProjectIds: [],
      executionProjectId: target.projectId,
    };
  }

  return {
    contextProjectIds: [],
    executionProjectId: APP_ROOT_EXECUTION_PROJECT_ID,
  };
}

export function buildOperationStudioIrisStartPayload(input: {
  contextProjectIds: string[];
  executionProjectId: string;
  model: ModelSelection | null;
  parts: PromptPart[];
}) {
  return {
    agent: "iris",
    contextProjectIds: input.contextProjectIds,
    executionProjectId: input.executionProjectId,
    model: input.model ?? undefined,
    parts: input.parts,
  };
}

export function buildOperationStudioIrisPromptPayload(input: {
  model: ModelSelection | null;
  parts: PromptPart[];
}) {
  return {
    agent: "iris",
    model: input.model ?? undefined,
    parts: input.parts,
  };
}

type LoaderData = {
  activeStepId: string;
  lunafreyaJobOptions: Array<{
    id: string;
    label: string;
    description: string | null;
    sourceKind: "builtin" | "project";
    sourceLabel: string;
  }>;
  lunafreyaSkillOptions: Array<{
    id: string;
    label: string;
    description: string | null;
    sourceKind: "builtin" | "project";
    sourceLabel: string;
  }>;
  partyMode: PreviewPartyMode;
  previewWorkers: WorkerAgentId[];
  userMessage: string;
  operations: OperationOption[];
  preview: ReturnType<typeof buildOperationStudioPreviewBundle> | null;
  projects: ProjectEntry[];
  scope: ProjectScope;
  selectedLunafreyaJobId: string | null;
  selectedLunafreyaSkillIds: string[];
  selectedOperation: string | null;
  targetValue: string;
  taskInstruction: string;
};

type PreviewStep = NonNullable<LoaderData["preview"]>["flowSteps"][number];
type PlanResponse = {
  changes: Array<{ action: "write" | "delete"; path: string }>;
  operationName: string;
  operationRef: string;
  yaml: string;
};
type FlowGroup = {
  parent: PreviewStep;
  children: PreviewStep[];
};

function getNodeBadgeLabel(step?: PreviewStep | null): string | null {
  if (!step) {
    return null;
  }

  if (step.isSoloLoop) {
    return "Solo Loop";
  }

  if (step.nodeKind === "step") {
    return null;
  }

  return "Child Event";
}

function formatNextLabel(step?: PreviewStep | null): string {
  if (!step) {
    return "Next: -";
  }

  if (step.isSoloLoop) {
    return "Loop: Continue with Noctis";
  }

  if (step.nodeKind === "delegated-dispatch" && step.nextTarget) {
    return `Awaiting report: ${step.nextTarget}`;
  }

  if (step.nodeKind === "delegated-return" && step.nextStep && step.nextTarget) {
    return `Returns: ${step.nextStep} by ${step.nextTarget}`;
  }

  if (step.nextAction === "delegate_child_task" && step.nextTarget) {
    return `Delegates: ${step.nextTarget}`;
  }

  if (step.nextTarget === "COMPLETE") {
    return "Complete";
  }

  if (step.nextTarget === "ABORT") {
    return "Abort";
  }

  if (step.nextStep && step.nextTarget) {
    return `Next: ${step.nextStep} by ${step.nextTarget}`;
  }

  if (step.nextStep) {
    return `Next: ${step.nextStep}`;
  }

  return "Next: -";
}

function getFlowGroups(bundle: LoaderData["preview"]): FlowGroup[] {
  if (!bundle) {
    return [];
  }

  return bundle.flowSteps
    .filter((step) => step.nodeKind === "step")
    .map((parent) => ({
      parent,
      children: bundle.flowSteps.filter((step) => step.parentId === parent.id),
    }));
}

function buildTargetOptions(projects: ProjectEntry[]) {
  return [
    { value: "builtin", label: "Builtin · No project" },
    ...projects.map((project) => ({
      value: `project:${project.id}`,
      label: `Project · ${project.displayName}`,
    })),
  ];
}

function createBlankDraftOperation(scope: ProjectScope, name = "new-operation"): OperationDefinition {
  const primaryAgent = scope === "lunafreya" ? "lunafreya" : "noctis";
  return {
    sourcePath: `/drafts/${name}.yaml`,
    name,
    description: "New Operation Studio draft",
    initial_step: "plan",
    jobs: {},
    instructions: {},
    skills: {},
    policies: {},
    steps: [
      {
        name: "plan",
        agent: primaryAgent,
        instruction: { inline: "Plan the workflow intent." },
        rules: [{ condition: "Draft outline complete", next: "finalize" }],
      },
      {
        name: "finalize",
        agent: primaryAgent,
        instruction: { inline: "Finalize the workflow contract." },
        rules: [{ condition: "Draft ready", next: "COMPLETE" }],
      },
    ],
  };
}

async function requestDraftPlan(input: {
  operation: OperationDefinition;
  sourceOperationRef?: string | null;
  targetValue: string;
}): Promise<PlanResponse> {
  const response = await fetch("/api/operation-studio/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Unable to build draft plan.");
  }

  return (await response.json()) as PlanResponse;
}

async function requestDraftPreview(input: {
  draft: OperationStudioDraftRecord;
  previewAllowedWorkers: WorkerAgentId[];
  scope: ProjectScope;
  selectedLunafreyaJobId: string | null;
  selectedLunafreyaSkillIds: string[];
  taskInstruction: string;
  targetValue: string;
  userMessage: string;
}): Promise<LoaderData["preview"]> {
  const response = await fetch("/api/operation-studio/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      previewAllowedWorkers: input.previewAllowedWorkers,
      scope: input.scope,
      selectedJobId: input.selectedLunafreyaJobId,
      selectedSkillIds: input.selectedLunafreyaSkillIds,
      source: {
        kind: "draft",
        draftId: input.draft.id,
        operation: input.draft.operation,
        ...(input.draft.sourceOperationRef ? { operationRef: input.draft.sourceOperationRef } : {}),
      },
      taskInstruction: input.taskInstruction,
      targetValue: input.targetValue,
      userMessage: input.userMessage,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Unable to build draft preview.");
  }

  return (await response.json()) as LoaderData["preview"];
}

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const scope = isProjectScope(url.searchParams.get("scope"))
    ? (url.searchParams.get("scope") as ProjectScope)
    : "noctis_team";
  const targetValue = url.searchParams.get("target")?.trim() || "builtin";
  const target = parseOperationStudioAuthoringTarget(targetValue);
  const operations = listOperationStudioOperationOptions({
    scope,
    target,
  });
  const requestedOperation = url.searchParams.get("operation")?.trim() || null;
  const selectedOperation =
    requestedOperation && operations.some((operation) => operation.value === requestedOperation)
      ? requestedOperation
      : (operations[0]?.value ?? null);
  const taskInstruction =
    url.searchParams.get("task")?.trim() ||
    "Execute the current step according to the workflow context.";
  const userMessage =
    url.searchParams.get("userMessage")?.trim() ||
    "This is a synthetic User message for operation activation.";
  const requestedPartyMode = url.searchParams.get("partyMode");
  const partyMode = isPreviewPartyMode(requestedPartyMode) ? requestedPartyMode : "full";
  const previewWorkers = resolvePreviewWorkers(
    partyMode,
    parsePreviewWorkers(url.searchParams.get("workers")),
  );
  const lunafreyaFacets =
    scope === "lunafreya"
      ? resolveOperationStudioLunafreyaFacetCatalog({
          selectedJobId: url.searchParams.get("lunafreyaJob")?.trim() || undefined,
          selectedSkillIds: parseSelectionList(url.searchParams.get("lunafreyaSkills")),
          target,
        })
      : null;

  const preview = selectedOperation
    ? buildOperationStudioPreviewBundle({
        ...(lunafreyaFacets ? { lunafreyaPromptExtension: lunafreyaFacets.promptExtension } : {}),
        userMessage,
        source: {
          kind: "saved",
          operationRef: selectedOperation,
        },
        previewAllowedWorkers: previewWorkers,
        taskInstruction,
      })
    : null;

  const activeStepParam = url.searchParams.get("step")?.trim() || null;
  const activeStepId =
    activeStepParam && preview?.flowSteps.some((step) => step.id === activeStepParam)
      ? activeStepParam
      : (preview?.flowSteps[0]?.id ?? "");

  return {
    activeStepId,
    lunafreyaJobOptions: lunafreyaFacets?.jobOptions ?? [],
    lunafreyaSkillOptions: lunafreyaFacets?.skillOptions ?? [],
    operations,
    partyMode,
    preview,
    previewWorkers,
    projects: readRegisteredProjects(getProjectRoot()),
    scope,
    selectedLunafreyaJobId: lunafreyaFacets?.selectedJobId ?? null,
    selectedLunafreyaSkillIds: lunafreyaFacets?.selectedSkillIds ?? [],
    selectedOperation,
    targetValue,
    taskInstruction,
    userMessage,
  } satisfies LoaderData;
};

export const OperationStudioPage = ({ loaderData }: Route.ComponentProps) => {
  const navigate = useNavigate();
  const selectedIrisModel = useChatStore((state) => state.agentModels.iris ?? null);
  const setAgentModel = useChatStore((state) => state.setAgentModel);
  const [scope, setScope] = useState<ProjectScope>(loaderData.scope);
  const [targetValue, setTargetValue] = useState(loaderData.targetValue);
  const [selectedOperation, setSelectedOperation] = useState(loaderData.selectedOperation ?? "");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState(loaderData.activeStepId);
  const [selectedLunafreyaJobId, setSelectedLunafreyaJobId] = useState<string | null>(
    loaderData.selectedLunafreyaJobId,
  );
  const [selectedLunafreyaSkillIds, setSelectedLunafreyaSkillIds] = useState<string[]>(
    loaderData.selectedLunafreyaSkillIds,
  );
  const [partyMode, setPartyMode] = useState<PreviewPartyMode>(loaderData.partyMode);
  const [previewWorkers, setPreviewWorkers] = useState(loaderData.previewWorkers);
  const [userMessage, setUserMessage] = useState(loaderData.userMessage);
  const [taskInstruction, setTaskInstruction] = useState(loaderData.taskInstruction);
  const [drafts, setDrafts] = useState<OperationStudioDraftRecord[]>([]);
  const [draftPreview, setDraftPreview] = useState<LoaderData["preview"] | null>(null);
  const [activePlan, setActivePlan] = useState<PlanResponse | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isDraftBusy, setIsDraftBusy] = useState(false);
  const [isInputsSheetOpen, setIsInputsSheetOpen] = useState(false);
  const [isIrisSheetOpen, setIsIrisSheetOpen] = useState(false);
  const [isSheetUiReady, setIsSheetUiReady] = useState(false);
  const [irisSessionState, setIrisSessionState] = useState<OperationStudioIrisSessionState | null>(null);
  const [irisMessages, setIrisMessages] = useState<MessageInfo[]>([]);
  const [irisError, setIrisError] = useState<string | null>(null);
  const [isIrisLoading, setIsIrisLoading] = useState(false);
  const [isIrisSending, setIsIrisSending] = useState(false);
  const irisLoadRequestIdRef = useRef(0);
  const appliedPreviewWorkersKey = loaderData.previewWorkers.join(",");
  const lastAppliedPreviewWorkersKeyRef = useRef(appliedPreviewWorkersKey);
  const studioIrisContextKey = useMemo(
    () => buildOperationStudioIrisContextKey({ scope, targetValue }),
    [scope, targetValue],
  );
  const initialStudioIrisContextKeyRef = useRef(studioIrisContextKey);
  const irisSessionId = irisSessionState?.sessionId ?? null;

  useEffect(() => {
    setIsSheetUiReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setDrafts(loadOperationStudioDrafts(window.localStorage));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    persistOperationStudioDrafts(window.localStorage, drafts);
  }, [drafts]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const restoredState = loadOperationStudioIrisSessionState(window.localStorage);
    setIrisSessionState(
      restoredState ?? startNewOperationStudioIrisSession({ contextKey: initialStudioIrisContextKeyRef.current }),
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !irisSessionState) {
      return;
    }

    persistOperationStudioIrisSessionState(window.localStorage, irisSessionState);
  }, [irisSessionState]);

  useEffect(() => {
    setScope(loaderData.scope);
  }, [loaderData.scope]);

  useEffect(() => {
    setTargetValue(loaderData.targetValue);
  }, [loaderData.targetValue]);

  useEffect(() => {
    setSelectedOperation(loaderData.selectedOperation ?? "");
  }, [loaderData.selectedOperation]);

  useEffect(() => {
    setSelectedLunafreyaJobId(loaderData.selectedLunafreyaJobId);
  }, [loaderData.selectedLunafreyaJobId]);

  useEffect(() => {
    setSelectedLunafreyaSkillIds(loaderData.selectedLunafreyaSkillIds);
  }, [loaderData.selectedLunafreyaSkillIds]);

  useEffect(() => {
    if (!selectedDraftId) {
      setActiveStepId(loaderData.activeStepId);
    }
  }, [loaderData.activeStepId, selectedDraftId]);

  useEffect(() => {
    setPartyMode(loaderData.partyMode);
  }, [loaderData.partyMode]);

  useEffect(() => {
    if (lastAppliedPreviewWorkersKeyRef.current === appliedPreviewWorkersKey) {
      return;
    }

    lastAppliedPreviewWorkersKeyRef.current = appliedPreviewWorkersKey;
    setPreviewWorkers(loaderData.previewWorkers);
  }, [appliedPreviewWorkersKey, loaderData.previewWorkers]);

  useEffect(() => {
    setUserMessage(loaderData.userMessage);
  }, [loaderData.userMessage]);

  useEffect(() => {
    setTaskInstruction(loaderData.taskInstruction);
  }, [loaderData.taskInstruction]);

  const syncIrisContextState = useCallback((nextContextKey: string) => {
    setIrisSessionState((current) => {
      if (!current) {
        return startNewOperationStudioIrisSession({ contextKey: nextContextKey });
      }

      if (!current.sessionId && current.contextKey !== nextContextKey) {
        return startNewOperationStudioIrisSession({ contextKey: nextContextKey });
      }

      return current;
    });
  }, []);

  const resetIrisConversation = useCallback((nextContextKey: string) => {
    irisLoadRequestIdRef.current += 1;
    setIrisSessionState(startNewOperationStudioIrisSession({ contextKey: nextContextKey }));
    setIrisMessages([]);
    setIrisError(null);
    setIsIrisLoading(false);
  }, []);

  const requestIrisContextTransition = useCallback((nextContextKey: string): boolean => {
    if (
      shouldPromptForOperationStudioIrisReset({
        currentState: irisSessionState,
        nextContextKey,
      })
    ) {
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(
          "Changing scope or authoring target can make the current Iris conversation misleading. Start a new Iris session and continue?",
        );
        if (!confirmed) {
          return false;
        }
      }

      resetIrisConversation(nextContextKey);
      return true;
    }

    syncIrisContextState(nextContextKey);
    return true;
  }, [irisSessionState, resetIrisConversation, syncIrisContextState]);

  useEffect(() => {
    syncIrisContextState(studioIrisContextKey);
  }, [studioIrisContextKey, syncIrisContextState]);

  const loadIrisMessages = useCallback(async (sessionId: string) => {
    const requestId = irisLoadRequestIdRef.current + 1;
    irisLoadRequestIdRef.current = requestId;
    setIsIrisLoading(true);

    try {
      const response = await fetch(`/api/session/${sessionId}`);
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; messages?: MessageInfo[] }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to load the Iris conversation.");
      }

      if (requestId !== irisLoadRequestIdRef.current) {
        return;
      }

      setIrisMessages(payload?.messages ?? []);
      setIrisError(null);
    } catch (error) {
      if (requestId !== irisLoadRequestIdRef.current) {
        return;
      }

      setIrisError(error instanceof Error ? error.message : String(error));
    } finally {
      if (requestId === irisLoadRequestIdRef.current) {
        setIsIrisLoading(false);
      }
    }
  }, []);

  const sessionStatuses = useSessionStatusFeed({
    enabled: Boolean(irisSessionId),
    onSessionIdle: (sessionId) => {
      if (sessionId === irisSessionId) {
        void loadIrisMessages(sessionId);
      }
    },
  });
  const irisSessionStatus = irisSessionId ? sessionStatuses[irisSessionId] ?? null : null;

  useEffect(() => {
    if (!irisSessionId) {
      irisLoadRequestIdRef.current += 1;
      setIrisMessages([]);
      setIrisError(null);
      setIsIrisLoading(false);
      return;
    }

    void loadIrisMessages(irisSessionId);
  }, [irisSessionId, loadIrisMessages]);

  useEffect(() => {
    if (!irisSessionId || !isSessionStatusActive(irisSessionStatus)) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadIrisMessages(irisSessionId);
    }, 2500);

    return () => {
      window.clearInterval(interval);
    };
  }, [irisSessionId, irisSessionStatus, loadIrisMessages]);

  const visibleDrafts = useMemo(
    () => drafts.filter((draft) => draft.scope === scope && draft.targetValue === targetValue),
    [drafts, scope, targetValue],
  );
  const selectedDraft = useMemo(
    () => visibleDrafts.find((draft) => draft.id === selectedDraftId) ?? null,
    [visibleDrafts, selectedDraftId],
  );

  useEffect(() => {
    if (selectedDraftId && !selectedDraft) {
      setSelectedDraftId(null);
      setDraftPreview(null);
      setDraftError(null);
    }
  }, [selectedDraft, selectedDraftId]);

  const navigateWithPreviewParams = ({
    nextScope,
    nextTargetValue,
    operation,
    nextSelectedLunafreyaJobId = selectedLunafreyaJobId,
    nextSelectedLunafreyaSkillIds = selectedLunafreyaSkillIds,
    stepId,
    userInput,
    nextPartyMode,
    nextPreviewWorkers,
    task,
  }: {
    nextScope: ProjectScope;
    nextTargetValue: string;
    operation: string;
    nextSelectedLunafreyaJobId?: string | null;
    nextSelectedLunafreyaSkillIds?: string[];
    stepId: string;
    userInput: string;
    nextPartyMode: PreviewPartyMode;
    nextPreviewWorkers: WorkerAgentId[];
    task: string;
  }) => {
    const params = new URLSearchParams();
    if (nextScope !== "noctis_team") {
      params.set("scope", nextScope);
    }
    if (nextTargetValue !== "builtin") {
      params.set("target", nextTargetValue);
    }
    if (nextScope === "lunafreya") {
      if (nextSelectedLunafreyaJobId?.trim()) {
        params.set("lunafreyaJob", nextSelectedLunafreyaJobId.trim());
      }
      if (nextSelectedLunafreyaSkillIds.length > 0) {
        params.set("lunafreyaSkills", nextSelectedLunafreyaSkillIds.join(","));
      }
    }
    if (operation) {
      params.set("operation", operation);
    }
    if (stepId) {
      params.set("step", stepId);
    }
    if (userInput.trim()) {
      params.set("userMessage", userInput.trim());
    }
    if (task.trim()) {
      params.set("task", task.trim());
    }
    if (nextPartyMode !== "full") {
      params.set("partyMode", nextPartyMode);
    }
    if (nextPartyMode === "custom" && nextPreviewWorkers.length > 0) {
      params.set("workers", nextPreviewWorkers.join(","));
    }

    const query = params.toString();
    void navigate(query ? `/operation-studio?${query}` : "/operation-studio");
  };

  const handleUpdatePreview = () => {
    if (selectedDraft) {
      void refreshDraftArtifacts(selectedDraft);
      return;
    }

    navigateWithPreviewParams({
      nextScope: scope,
      nextTargetValue: targetValue,
      operation: selectedOperation,
      stepId: activeStepId,
      userInput: userMessage,
      nextPartyMode: partyMode,
      nextPreviewWorkers: previewWorkers,
      task: taskInstruction,
    });
  };

  const handleRestoreDefaults = () => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Restore default preview inputs and clear the current preview context?",
      );
      if (!confirmed) {
        return;
      }
    }

    const operation = loaderData.operations[0]?.value ?? "";
    resetIrisConversation(buildOperationStudioIrisContextKey({ scope: "noctis_team", targetValue: "builtin" }));
    setScope("noctis_team");
    setTargetValue("builtin");
    setSelectedDraftId(null);
    setDraftPreview(null);
    setActivePlan(null);
    setDraftError(null);
    setSelectedOperation(operation);
    setActiveStepId("");
    setPartyMode("full");
    setPreviewWorkers([...WORKING_PARTY_MEMBER_IDS]);
    setUserMessage("This is a synthetic User message for operation activation.");
    setTaskInstruction("Execute the current step according to the workflow context.");
    setIsInputsSheetOpen(false);
    setIsIrisSheetOpen(false);
    void navigate("/operation-studio");
  };

  const refreshDraftArtifacts = useCallback(async (draft: OperationStudioDraftRecord) => {
    setIsDraftBusy(true);
    setDraftError(null);

    try {
      const [previewResult, planResult] = await Promise.all([
        requestDraftPreview({
          draft,
          previewAllowedWorkers: resolvePreviewWorkers(partyMode, previewWorkers),
          scope,
          selectedLunafreyaJobId,
          selectedLunafreyaSkillIds,
          taskInstruction,
          targetValue,
          userMessage,
        }),
        requestDraftPlan({
          operation: draft.operation,
          sourceOperationRef: draft.sourceOperationRef,
          targetValue: draft.targetValue,
        }),
      ]);
      setDraftPreview(previewResult);
      setActivePlan(planResult);
      setActiveStepId((current) =>
        current && previewResult?.flowSteps.some((step) => step.id === current)
          ? current
          : (previewResult?.flowSteps[0]?.id ?? ""),
      );
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : String(error));
      setDraftPreview(null);
      setActivePlan(null);
    } finally {
      setIsDraftBusy(false);
    }
  }, [
    partyMode,
    previewWorkers,
    scope,
    selectedLunafreyaJobId,
    selectedLunafreyaSkillIds,
    targetValue,
    taskInstruction,
    userMessage,
  ]);

  const handleCreateDraft = () => {
    const sourceRef = selectedOperation || null;
    const operation = loaderData.preview?.operation ?? createBlankDraftOperation(scope);
    const nextDraft: OperationStudioDraftRecord = {
      id: crypto.randomUUID(),
      operation: {
        ...operation,
        sourcePath: operation.sourcePath || `/drafts/${operation.name}.yaml`,
      },
      scope,
      sourceOperationRef: sourceRef,
      targetValue,
      updatedAt: new Date().toISOString(),
    };

    const nextDrafts = replaceOperationStudioDraft(drafts, nextDraft);
    setDrafts(nextDrafts);
    setSelectedDraftId(nextDraft.id);
  };

  const handleCreateBlankDraft = () => {
    const nextDraft: OperationStudioDraftRecord = {
      id: crypto.randomUUID(),
      operation: createBlankDraftOperation(scope),
      scope,
      sourceOperationRef: null,
      targetValue,
      updatedAt: new Date().toISOString(),
    };

    const nextDrafts = replaceOperationStudioDraft(drafts, nextDraft);
    setDrafts(nextDrafts);
    setSelectedDraftId(nextDraft.id);
  };

  const handleDiscardDraft = () => {
    if (!selectedDraft) {
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Discard draft "${selectedDraft.operation.name}"?`);
      if (!confirmed) {
        return;
      }
    }

    setDrafts((current) => removeOperationStudioDraft(current, selectedDraft.id));
    setSelectedDraftId(null);
    setDraftPreview(null);
    setActivePlan(null);
    setDraftError(null);
  };

  const handleApplyDraft = async () => {
    if (!selectedDraft || !activePlan) {
      return;
    }

    const changeSummary = activePlan.changes.map((change) => `${change.action}: ${change.path}`).join("\n");
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `Apply draft "${activePlan.operationName}"?\n\n${changeSummary}`,
      );
      if (!confirmed) {
        return;
      }
    }

    setIsDraftBusy(true);
    try {
      const response = await fetch("/api/operation-studio/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: selectedDraft.operation,
          sourceOperationRef: selectedDraft.sourceOperationRef,
          targetValue: selectedDraft.targetValue,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to apply draft.");
      }

      const result = (await response.json()) as PlanResponse;
      setDrafts((current) => removeOperationStudioDraft(current, selectedDraft.id));
      setSelectedDraftId(null);
      setDraftPreview(null);
      setActivePlan(result);
      setDraftError(null);
      setSelectedOperation(result.operationRef);
      navigateWithPreviewParams({
        nextScope: scope,
        nextTargetValue: targetValue,
        operation: result.operationRef,
        stepId: "",
        userInput: userMessage,
        nextPartyMode: partyMode,
        nextPreviewWorkers: previewWorkers,
        task: taskInstruction,
      });
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDraftBusy(false);
    }
  };

  useEffect(() => {
    if (selectedDraft) {
      void refreshDraftArtifacts(selectedDraft);
      return;
    }

    setDraftPreview(null);
    setDraftError(null);

    if (!loaderData.preview?.operation) {
      setActivePlan(null);
      return;
    }

    let cancelled = false;
    void requestDraftPlan({
      operation: loaderData.preview.operation,
      sourceOperationRef: selectedOperation,
      targetValue,
    })
      .then((plan) => {
        if (!cancelled) {
          setActivePlan(plan);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDraftError(error instanceof Error ? error.message : String(error));
          setActivePlan(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loaderData.preview, refreshDraftArtifacts, selectedDraft, selectedOperation, targetValue]);

  const bundle = selectedDraft ? draftPreview : loaderData.preview;
  const selectedOperationOption = useMemo(
    () =>
      loaderData.operations.find((operation) => operation.value === selectedOperation) ??
      loaderData.operations[0] ??
      null,
    [loaderData.operations, selectedOperation],
  );
  const selectedEntryLabel = selectedDraft
    ? `Draft · ${selectedDraft.operation.name}`
    : (selectedOperationOption?.label ?? "No operation selected");
  const selectedEntryDescription = selectedDraft?.operation.description ?? selectedOperationOption?.description ?? null;
  const targetOptions = useMemo(() => buildTargetOptions(loaderData.projects), [loaderData.projects]);
  const selectedTargetLabel =
    targetOptions.find((option) => option.value === targetValue)?.label ?? "Builtin · No project";
  const flowGroups = useMemo(() => getFlowGroups(bundle), [bundle]);
  const selectedStep = useMemo(
    () => bundle?.flowSteps.find((step) => step.id === activeStepId) ?? bundle?.flowSteps[0] ?? null,
    [bundle, activeStepId],
  );
  const selectedStepNumber = useMemo(() => {
    if (!flowGroups.length || !selectedStep) {
      return null;
    }

    const index = flowGroups.findIndex((group) => group.parent.id === selectedStep.topLevelStepId);
    return index >= 0 ? index + 1 : null;
  }, [flowGroups, selectedStep]);
  const selectedNodeBadge = useMemo(() => getNodeBadgeLabel(selectedStep), [selectedStep]);
  const appliedPreviewPartySummary = useMemo(
    () => formatPreviewPartySummary(loaderData.previewWorkers),
    [loaderData.previewWorkers],
  );
  const draftPreviewPartySummary = useMemo(
    () => formatPreviewPartySummary(previewWorkers),
    [previewWorkers],
  );
  const selectedLunafreyaJobLabel = useMemo(
    () =>
      loaderData.lunafreyaJobOptions.find((option) => option.id === selectedLunafreyaJobId)?.label ?? null,
    [loaderData.lunafreyaJobOptions, selectedLunafreyaJobId],
  );
  const selectedLunafreyaSkillLabels = useMemo(
    () =>
      loaderData.lunafreyaSkillOptions
        .filter((option) => selectedLunafreyaSkillIds.includes(option.id))
        .map((option) => option.label),
    [loaderData.lunafreyaSkillOptions, selectedLunafreyaSkillIds],
  );
  const selectedOperationDefinition = selectedDraft?.operation ?? bundle?.operation ?? null;
  const showPartyModeControls = useMemo(
    () => operationSupportsDelegationPreview(selectedOperationDefinition),
    [selectedOperationDefinition],
  );
  const showWorkerTaskSeedControl = useMemo(
    () => operationNeedsWorkerTaskSeed(selectedOperationDefinition),
    [selectedOperationDefinition],
  );
  const hasPendingInputChanges =
    scope !== loaderData.scope ||
    targetValue !== loaderData.targetValue ||
    (showPartyModeControls && partyMode !== loaderData.partyMode) ||
    (showPartyModeControls && previewWorkers.join(",") !== appliedPreviewWorkersKey) ||
    userMessage !== loaderData.userMessage ||
    (showWorkerTaskSeedControl && taskInstruction !== loaderData.taskInstruction);
  const irisConversationSummary = useMemo(
    () => [PROJECT_SCOPE_LABELS[scope], selectedTargetLabel, selectedEntryLabel].join(" · "),
    [scope, selectedEntryLabel, selectedTargetLabel],
  );
  const irisPresentationMessages = useMemo(
    () => toSessionPresentationMessages(irisMessages),
    [irisMessages],
  );
  const irisRenderSnapshot = useSessionChatRenderSnapshot({
    messages: irisPresentationMessages,
  });

  const handleIrisPromptSend = useCallback(async (parts: PromptPart[]) => {
    const promptParts = prependOperationStudioIrisContext(
      {
        draftPreviewPartySummary: showPartyModeControls ? draftPreviewPartySummary : null,
        lunafreyaJobLabel: selectedLunafreyaJobLabel,
        lunafreyaSkillLabels: selectedLunafreyaSkillLabels,
        scopeLabel: PROJECT_SCOPE_LABELS[scope],
        selectedEntryDescription,
        selectedEntryLabel,
        selectedNodeBadge,
        selectedStepNumber,
        selectedStepTitle: selectedStep?.title ?? null,
        targetLabel: selectedTargetLabel,
        taskInstruction: showWorkerTaskSeedControl ? taskInstruction : null,
        userMessage,
      },
      parts,
    );
    const nowIso = new Date().toISOString();

    setIrisError(null);
    setIsIrisSending(true);

    try {
      if (!irisSessionId) {
        const executionContext = resolveOperationStudioIrisExecutionContext(targetValue);
        const response = await fetch("/api/opencode/session/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildOperationStudioIrisStartPayload({
              contextProjectIds: executionContext.contextProjectIds,
              executionProjectId: executionContext.executionProjectId,
              model: selectedIrisModel,
              parts: promptParts,
            }),
          ),
        });
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; session?: { id?: string } }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error ?? "Unable to start the Iris session.");
        }

        const nextSessionId = payload?.session?.id ?? null;
        if (!nextSessionId) {
          throw new Error("Iris session creation returned no ID.");
        }

        setIrisSessionState({
          contextKey: studioIrisContextKey,
          sessionId: nextSessionId,
          updatedAt: nowIso,
        });
        void loadIrisMessages(nextSessionId);
        return;
      }

      const response = await fetch(`/api/session/${irisSessionId}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildOperationStudioIrisPromptPayload({
            model: selectedIrisModel,
            parts: promptParts,
          }),
        ),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to send the Iris prompt.");
      }

      setIrisSessionState((current) =>
        current
          ? {
              ...current,
              updatedAt: nowIso,
            }
          : {
              contextKey: studioIrisContextKey,
              sessionId: irisSessionId,
              updatedAt: nowIso,
            },
      );
      void loadIrisMessages(irisSessionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setIrisError(message);
      throw error;
    } finally {
      setIsIrisSending(false);
    }
  }, [
    draftPreviewPartySummary,
    irisSessionId,
    loadIrisMessages,
    scope,
    selectedEntryDescription,
    selectedEntryLabel,
    selectedLunafreyaJobLabel,
    selectedLunafreyaSkillLabels,
    selectedNodeBadge,
    selectedStep?.title,
    selectedStepNumber,
    selectedTargetLabel,
    showPartyModeControls,
    showWorkerTaskSeedControl,
    studioIrisContextKey,
    targetValue,
    taskInstruction,
    userMessage,
    selectedIrisModel,
  ]);

  const handleOpenIrisSheet = useCallback(() => {
    if (!requestIrisContextTransition(studioIrisContextKey)) {
      return;
    }

    setIsInputsSheetOpen(false);
    setIsIrisSheetOpen(true);
  }, [requestIrisContextTransition, studioIrisContextKey]);

  const facetStats = useMemo(() => {
    if (!selectedStep?.resolvedFacets) {
      return [] as Array<{ label: string; value: string }>;
    }

    return [
      { label: "Job", value: selectedStep.resolvedFacets.job ? "loaded" : "missing" },
      {
        label: "Instruction",
        value: selectedStep.resolvedFacets.instruction ? "loaded" : "missing",
      },
      {
        label: "Skills",
        value:
          selectedStep.resolvedFacets.skills.length > 0
            ? `${selectedStep.resolvedFacets.skills.length} loaded`
            : "missing",
      },
      {
        label: "Policy",
        value:
          selectedStep.resolvedFacets.policies.length > 0
            ? `${selectedStep.resolvedFacets.policies.length} loaded`
            : "missing",
      },
      {
        label: "Output Contract",
        value:
          selectedStep.resolvedFacets.outputContracts.length > 0
            ? `${selectedStep.resolvedFacets.outputContracts.length} loaded`
            : "missing",
      },
    ];
  }, [selectedStep]);

  const finalPrompt = useMemo(() => {
    if (!selectedStep) {
      return "No preview available.";
    }

    return selectedStep.effectivePrompt ?? selectedStep.injectedPrompt;
  }, [selectedStep]);

  const completionContract = useMemo(() => {
    if (!selectedStep) {
      return "No completion contract available.";
    }

    return selectedStep.completionContract || "No completion contract available.";
  }, [selectedStep]);

  const runtimeDecision = useMemo(() => {
    if (!selectedStep) {
      return "No runtime decision available.";
    }

    return selectedStep.runtimeDecision || "No runtime decision available.";
  }, [selectedStep]);

  const advancedBlocks = useMemo(() => {
    if (!selectedStep) {
      return [] as Array<{ id: string; title: string; description: string; content: string }>;
    }

    const blocks: Array<{ id: string; title: string; description: string; content: string }> = [
      {
        id: "flow-item-id",
        title: "Flow Item ID",
        description: "Stable synthetic identifier for the selected preview node.",
        content: selectedStep.id,
      },
      {
        id: "internal",
        title: "Internal Context",
        description: "Shared context injected before the workflow-specific prompt.",
        content: selectedStep.internalContext,
      },
      {
        id: "step-context",
        title: "Step Context",
        description: "Synthetic operation state summary for this step execution.",
        content: selectedStep.operationContextSummary ?? "No context available.",
      },
      {
        id: "source",
        title:
          selectedStep.nodeKind === "delegated-return" ? "Worker Report Message" : "Prompt Source Input",
        description:
          selectedStep.nodeKind === "delegated-return"
            ? "Synthetic delegated child report body routed back to Noctis."
            : "Raw input used to build the runtime -> agent prompt.",
        content: selectedStep.sourceInput,
      },
      {
        id: "transport",
        title:
          selectedStep.nodeKind === "delegated-return"
            ? "Accepted Report Transport"
            : "Synthetic Report Transport",
        description:
          selectedStep.nodeKind === "delegated-dispatch"
            ? "This node dispatches a child task and does not yet emit a report transport."
            : selectedStep.nodeKind === "delegated-return"
              ? "Transport payload accepted from the delegated worker before returning to Noctis."
              : "Transport payload sent from the current agent back to Runtime.",
        content: selectedStep.reportTransport || "No report transport generated for this node.",
      },
      {
        id: "hooks",
        title: "Hook Metadata",
        description: "Low-level hook stages involved in this step.",
        content: selectedStep.hookTrail.join(" -> "),
      },
    ];

    if (selectedStep.workflowGuidance?.trim()) {
      blocks.push({
        id: "guidance",
        title: "Workflow Guidance",
        description:
          selectedStep.nodeKind === "delegated-return"
            ? "Runtime guidance handed back to Noctis after the delegated child report."
            : "Raw runtime guidance generated after the synthetic report.",
        content: selectedStep.workflowGuidance,
      });
    }

    if (selectedStep.ruleEvaluation?.trim()) {
      blocks.push({
        id: "rule",
        title: "Rule Evaluation",
        description: "Expanded decision trace for the synthetic report.",
        content: selectedStep.ruleEvaluation,
      });
    }

    if (selectedStep.suppressedContext?.trim()) {
      blocks.push({
        id: "suppressed",
        title: "Suppressed Metadata",
        description: "Debug-only metadata kept outside the agent-visible prompt.",
        content: selectedStep.suppressedContext,
      });
    }

    return blocks;
  }, [selectedStep]);

  return (
    <PageContainer
      className="max-w-none gap-3 overflow-hidden bg-transparent px-4 py-3 text-slate-100 sm:py-4"
      size="wide"
    >
      <div className="border-border/50 border-b pb-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge className="gap-1.5 text-white" variant="default">
              <Sparkles className="h-3.5 w-3.5" />
              Operation Studio
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <ToggleGroup
              aria-label="Operation Studio scope"
              className="gap-0 rounded-full border border-slate-700/60 bg-slate-950/25 p-0.5"
              onValueChange={(nextScope) => {
                if (!isProjectScope(nextScope) || nextScope === scope) {
                  return;
                }

                const nextContextKey = buildOperationStudioIrisContextKey({
                  scope: nextScope,
                  targetValue,
                });
                if (!requestIrisContextTransition(nextContextKey)) {
                  return;
                }

                setScope(nextScope);
                setSelectedOperation("");
                setActiveStepId("");
                navigateWithPreviewParams({
                  nextScope,
                  nextTargetValue: targetValue,
                  operation: "",
                  stepId: "",
                  userInput: userMessage,
                  nextPartyMode: partyMode,
                  nextPreviewWorkers: previewWorkers,
                  task: taskInstruction,
                });
              }}
              size="sm"
              type="single"
              value={scope}
            >
              {(["noctis_team", "lunafreya"] as const).map((option) => (
                <ToggleGroupItem
                  key={option}
                  aria-label={PROJECT_SCOPE_LABELS[option]}
                  className="h-8 rounded-none border-0 px-3 text-slate-300 shadow-none hover:bg-slate-900/70 hover:text-slate-100 focus-visible:z-10 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90 first:rounded-l-full last:rounded-r-full"
                  value={option}
                >
                  {PROJECT_SCOPE_LABELS[option]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button
              className="h-8 px-2.5"
              onClick={() => {
                setIsIrisSheetOpen(false);
                setIsInputsSheetOpen(true);
              }}
              size="sm"
              variant={hasPendingInputChanges ? "default" : "outline"}
            >
              <Settings2 className="h-4 w-4" />
              Preview Inputs
            </Button>
            <Button className="h-8 px-2.5" onClick={handleUpdatePreview} size="sm">
              <RefreshCw className="h-4 w-4" />
              Update Preview
            </Button>
          </div>
        </div>
      </div>

      <ResizablePanelGroup
        className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-800/70 bg-slate-950/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-sm"
        orientation="horizontal"
      >
        <ResizablePanel defaultSize={24} minSize={18}>
          <OperationListPane
            drafts={visibleDrafts}
            onCreateBlankDraft={handleCreateBlankDraft}
            onSelectDraft={(draftId) => {
              setSelectedDraftId(draftId);
              setDraftError(null);
            }}
            onSelectOperation={(operationValue) => {
              setSelectedDraftId(null);
              setDraftPreview(null);
              setDraftError(null);
              setSelectedOperation(operationValue);
              setActiveStepId("");
              navigateWithPreviewParams({
                nextScope: scope,
                nextTargetValue: targetValue,
                operation: operationValue,
                nextPartyMode: loaderData.partyMode,
                nextPreviewWorkers: loaderData.previewWorkers,
                stepId: "",
                task: loaderData.taskInstruction,
                userInput: loaderData.userMessage,
              });
            }}
            operations={loaderData.operations}
            selectedDraftId={selectedDraftId}
            selectedOperation={selectedOperation}
          />
        </ResizablePanel>

        <ResizablePanel defaultSize={31} minSize={24}>
          <FlowBrowserPane
            flowGroups={flowGroups}
            onSelectStep={(stepId) => {
              setActiveStepId(stepId);
              if (selectedDraft) {
                return;
              }
              navigateWithPreviewParams({
                nextScope: scope,
                nextTargetValue: targetValue,
                operation: selectedOperation,
                nextPartyMode: loaderData.partyMode,
                nextPreviewWorkers: loaderData.previewWorkers,
                stepId,
                task: loaderData.taskInstruction,
                userInput: loaderData.userMessage,
              });
            }}
            selectedStepId={selectedStep?.id ?? null}
          />
        </ResizablePanel>

        <ResizablePanel defaultSize={45} minSize={28}>
          <section className="flex h-full min-w-0 flex-col overflow-hidden bg-slate-900/25 backdrop-blur-sm">
            <div className="flex min-h-16 items-center justify-between border-slate-800/70 border-b bg-white/2 px-4">
              <h2 className="font-semibold text-sm text-slate-50">Prompt Details</h2>
              <div className="flex items-center gap-2">
                {selectedDraft ? (
                  <>
                    <Button disabled={isDraftBusy} onClick={() => void handleApplyDraft()} size="sm">
                      <Wrench className="h-4 w-4" />
                      Apply Draft
                    </Button>
                    <Button disabled={isDraftBusy} onClick={handleDiscardDraft} size="sm" variant="outline">
                      Discard
                    </Button>
                  </>
                ) : (
                  <Button disabled={!loaderData.preview?.operation} onClick={handleCreateDraft} size="sm" variant="outline">
                    <Bot className="h-4 w-4" />
                    Create Draft
                  </Button>
                )}
                <Button onClick={handleOpenIrisSheet} size="sm" variant={isIrisSheetOpen ? "default" : "outline"}>
                  <Sparkles className="h-4 w-4" />
                  Ask Iris
                </Button>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:!block [&>div]:!w-full">
              <div className="space-y-4 p-4 pr-5">
                {draftError ? (
                  <Card className="border-red-700/40 bg-red-500/10 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] backdrop-blur-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Draft Error</CardTitle>
                      <CardDescription className="text-red-100/80">
                        Operation Studio could not refresh the current draft artifacts.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-slate-200">{draftError}</CardContent>
                  </Card>
                ) : null}

                {isDraftBusy ? (
                  <div className="rounded-lg border border-slate-700/70 bg-slate-950/35 p-3 text-slate-400 text-xs">
                    Refreshing draft preview…
                  </div>
                ) : null}

                {selectedStep?.noFlowExplanation?.trim() ? (
                  <Card className="border-teal-700/40 bg-teal-500/10 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] backdrop-blur-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Why No Flow?</CardTitle>
                      <CardDescription className="text-teal-100/80">
                        This preview intentionally stays on the same autonomous step instead of fabricating a downstream transition.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-slate-200">
                      <p>{selectedStep.noFlowExplanation}</p>
                      <p className="font-medium text-teal-100">{appliedPreviewPartySummary}</p>
                    </CardContent>
                  </Card>
                ) : null}

                <Card className="border-slate-700/70 bg-slate-900/35 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] backdrop-blur-sm">
                  <CardHeader className="border-slate-800/70 border-b bg-white/2 py-3">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <div className="truncate font-semibold text-base text-slate-50">
                            {selectedStep?.title ?? "No flow item selected"}
                          </div>
                          {selectedStepNumber ? <Badge variant="outline">Step {selectedStepNumber}</Badge> : null}
                          {selectedNodeBadge ? <Badge variant="outline">{selectedNodeBadge}</Badge> : null}
                        </div>

                        {selectedStep ? (
                          <div className="font-medium text-blue-100 text-xs">{formatNextLabel(selectedStep)}</div>
                        ) : null}
                      </div>

                      {selectedStep?.pathSummary ? (
                        <div className="flex min-w-0 items-center gap-1.5 text-slate-400 text-xs">
                          <Send className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{selectedStep.pathSummary}</span>
                        </div>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-3">
                    <PreviewTabs
                      advancedBlocks={advancedBlocks}
                      completionContract={completionContract}
                      facetStats={facetStats}
                      finalPrompt={finalPrompt}
                      runtimeDecision={runtimeDecision}
                      selectedStep={selectedStep}
                      yamlContent={activePlan?.yaml ?? "No YAML review available."}
                    />
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>

      {isSheetUiReady ? (
        <>
          <PreviewInputsSheet
            disableUpdatePreview={!selectedOperation && !selectedDraft}
            draftPreviewPartySummary={draftPreviewPartySummary}
            isOpen={isInputsSheetOpen}
            lunafreyaJobOptions={loaderData.lunafreyaJobOptions}
            lunafreyaSkillOptions={loaderData.lunafreyaSkillOptions}
            onRestoreDefaults={handleRestoreDefaults}
            onUpdatePreview={() => {
              handleUpdatePreview();
              setIsInputsSheetOpen(false);
            }}
            onClose={() => setIsInputsSheetOpen(false)}
            onPartyModeChange={(value) => {
              setPartyMode(value);
              setPreviewWorkers(resolvePreviewWorkers(value, previewWorkers));
            }}
            onSelectedLunafreyaJobIdChange={setSelectedLunafreyaJobId}
            onSelectedLunafreyaSkillIdsChange={setSelectedLunafreyaSkillIds}
            onTargetValueChange={(nextTargetValue) => {
              const nextContextKey = buildOperationStudioIrisContextKey({
                scope,
                targetValue: nextTargetValue,
              });
              if (!requestIrisContextTransition(nextContextKey)) {
                return;
              }

              setTargetValue(nextTargetValue);
            }}
            onTaskInstructionChange={setTaskInstruction}
            onTogglePreviewWorker={(workerId) => {
              setPreviewWorkers((currentPreviewWorkers) =>
                currentPreviewWorkers.includes(workerId)
                  ? currentPreviewWorkers.filter((worker) => worker !== workerId)
                  : [...currentPreviewWorkers, workerId],
              );
            }}
            onUserMessageChange={setUserMessage}
            partyMode={partyMode}
            previewWorkers={previewWorkers}
            scope={scope}
            selectedEntryDescription={selectedEntryDescription}
            selectedEntryLabel={selectedEntryLabel}
            selectedLunafreyaJobId={selectedLunafreyaJobId}
            selectedLunafreyaSkillIds={selectedLunafreyaSkillIds}
            showPartyModeControls={showPartyModeControls}
            showWorkerTaskSeedControl={showWorkerTaskSeedControl}
            targetOptions={targetOptions}
            targetValue={targetValue}
            taskInstruction={taskInstruction}
            userMessage={userMessage}
          />

          <IrisAuthoringSheet
            autoFollowKey={irisRenderSnapshot.autoFollowKey}
            composerDraftKey={`operation-studio:iris:${irisSessionId ?? studioIrisContextKey}`}
            conversationSummary={irisConversationSummary}
            error={irisError}
            isLoading={isIrisLoading}
            isOpen={isIrisSheetOpen}
            isSending={isIrisSending}
            onClose={() => setIsIrisSheetOpen(false)}
            onNewSession={() => resetIrisConversation(studioIrisContextKey)}
            onSend={handleIrisPromptSend}
            onSelectedModelChange={(model) => setAgentModel("iris", model)}
            renderedMessages={irisRenderSnapshot.renderedMessages}
            scopeLabel={PROJECT_SCOPE_LABELS[scope]}
            scrollSignal={irisRenderSnapshot.scrollSignal}
            selectedModel={selectedIrisModel}
            selectedEntryLabel={selectedEntryLabel}
            sessionId={irisSessionId}
            sessionStatus={irisSessionStatus}
            streamingMessage={irisRenderSnapshot.streamingMessage}
            targetLabel={selectedTargetLabel}
          />
        </>
      ) : null}
    </PageContainer>
  );
};

export default OperationStudioPage;
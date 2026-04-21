import { FolderGit2, GitBranch, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { WorkspaceLaunchActions } from "@/components/workspace-launch-actions";
import { Alert, AlertCircle, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageContainer } from "@/components/page-container";
import { useSessionStatusFeed } from "@/hooks/use-session-status-feed";
import type { ProjectRegistryEntry } from "@/hooks/use-project-registry";
import { useVSCodePreferences } from "@/hooks/use-vscode-preferences";
import { getProjectRoot } from "@/lib/get-project-root.server";
import type { PromptPart } from "@/lib/prompt-parts";
import {
  createProjectIrisSessionState,
  loadProjectIrisSessionState,
  persistProjectIrisSessionState,
  startNewProjectIrisSession,
} from "@/lib/project-management/iris-session";
import { prependProjectIrisContext } from "@/lib/project-management/iris-prompt";
import { resolveProjectManageSkill, type ProjectManageSkillAvailability } from "@/lib/project-management/project-manage-skill.server";
import { readRegisteredProjects } from "@/lib/project-config.server";
import {
  buildSessionChatRenderSnapshot,
  type SessionChatRenderSnapshot,
} from "@/lib/session-chat-rendering-orchestration";
import {
  toSessionPresentationMessages,
  type SessionPresentationMessage,
} from "@/lib/session-message-presentation";
import { getSessionStatusForId } from "@/lib/session-status";
import type { ModelSelection } from "@/lib/types/mission";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import type { MessageInfo } from "@/lib/opencode-session-types";
import { ProjectIrisSheet } from "./components/project-iris-sheet";
import type { Route } from "./+types/route";

interface ProjectsApiData {
  error?: string;
  projects: ProjectRegistryEntry[];
}

type ProjectsPageLoaderData = {
  initialData?: ProjectsApiData | null;
  initialFetchError?: string | null;
  projectManageSkill?: ProjectManageSkillAvailability | null;
};

type ProjectIrisSessionHistoryResponse = {
  error?: string;
  messages?: MessageInfo[];
};

type ProjectIrisSessionStartResponse = {
  error?: string;
  session?: {
    id?: string | null;
  } | null;
};

const EMPTY_PROJECT_IRIS_SESSION_STATE = createProjectIrisSessionState({
  sessionId: null,
  updatedAt: "",
});
const PROJECT_IRIS_AGENT_ID = "iris";
const PROJECT_IRIS_HELPER_TEXT = "Register, rename, refresh, or delete projects by chatting with Iris.";
const PROJECT_IRIS_UNAVAILABLE_ERROR = "Pinned project-manage skill is unavailable.";

export function normalizeProjectIrisHistoryMessages(
  messages: MessageInfo[],
): SessionPresentationMessage[] {
  return toSessionPresentationMessages(messages);
}

async function fetchProjectIrisMessages(sessionId: string): Promise<SessionPresentationMessage[]> {
  const response = await fetch(`/api/session/${sessionId}`);
  const data = (await response.json().catch(() => null)) as ProjectIrisSessionHistoryResponse | null;

  if (!response.ok) {
    throw new Error(data?.error ?? `HTTP ${response.status}`);
  }

  return normalizeProjectIrisHistoryMessages(data?.messages ?? []);
}

async function startProjectIrisSession(input: {
  model: ModelSelection | null;
  parts: PromptPart[];
}): Promise<string> {
  const response = await fetch("/api/opencode/session/start", {
    body: JSON.stringify({
      agent: PROJECT_IRIS_AGENT_ID,
      ...(input.model ? { model: input.model } : {}),
      parts: input.parts,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const data = (await response.json().catch(() => null)) as ProjectIrisSessionStartResponse | null;

  if (!response.ok) {
    throw new Error(data?.error ?? `HTTP ${response.status}`);
  }

  const sessionId = data?.session?.id;
  if (!sessionId) {
    throw new Error("Session creation returned no ID");
  }

  return sessionId;
}

async function sendProjectIrisPrompt(input: {
  model: ModelSelection | null;
  parts: PromptPart[];
  sessionId: string;
}): Promise<void> {
  const response = await fetch(`/api/session/${input.sessionId}/prompt`, {
    body: JSON.stringify({
      agent: PROJECT_IRIS_AGENT_ID,
      ...(input.model ? { model: input.model } : {}),
      parts: input.parts,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (response.ok) {
    return;
  }

  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(data?.error ?? `HTTP ${response.status}`);
}

export async function loader() {
  try {
    const root = getProjectRoot();
    return {
      initialData: {
        projects: readRegisteredProjects(root),
      },
      initialFetchError: null,
      projectManageSkill: resolveProjectManageSkill(root),
    } satisfies ProjectsPageLoaderData;
  } catch (error) {
    const root = getProjectRoot();
    return {
      initialData: null,
      initialFetchError: String(error),
      projectManageSkill: resolveProjectManageSkill(root),
    } satisfies ProjectsPageLoaderData;
  }
}

const formatPath = (path: string): string => {
  if (!path) {
    return "—";
  }
  if (path.length <= 42) {
    return path;
  }
  const parts = path.split("/");
  if (parts.length >= 3) {
    return `…/${parts.slice(-2).join("/")}`;
  }
  return `…${path.slice(-39)}`;
};

export const ProjectsPage = ({ loaderData }: { loaderData?: ProjectsPageLoaderData }) => {
  const selectedProjectIrisModel = useChatStore(
    (state) => state.agentModels[PROJECT_IRIS_AGENT_ID] ?? null,
  );
  const setAgentModel = useChatStore((state) => state.setAgentModel);
  const [serverData, setServerData] = useState<ProjectsApiData | null>(loaderData?.initialData ?? null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(loaderData?.initialFetchError ?? null);
  const [isProjectIrisSheetOpen, setIsProjectIrisSheetOpen] = useState(false);
  const [projectIrisError, setProjectIrisError] = useState<string | null>(
    loaderData?.projectManageSkill?.available === false
      ? loaderData.projectManageSkill.error
      : null,
  );
  const [projectIrisSessionState, setProjectIrisSessionState] = useState(
    EMPTY_PROJECT_IRIS_SESSION_STATE,
  );
  const [hasHydratedProjectIrisSession, setHasHydratedProjectIrisSession] = useState(false);
  const [projectIrisRenderSnapshot, setProjectIrisRenderSnapshot] =
    useState<SessionChatRenderSnapshot | null>(null);
  const [isProjectIrisLoading, setIsProjectIrisLoading] = useState(false);
  const [isProjectIrisSending, setIsProjectIrisSending] = useState(false);
  const { vscodePreferences, updateVSCodePreference } = useVSCodePreferences();
  const projectManageSkill = loaderData?.projectManageSkill ?? null;
  const projectIrisSessionId = projectIrisSessionState.sessionId;

  const loadProjectIrisMessages = useCallback(
    async (sessionId: string) => {
      setIsProjectIrisLoading(true);

      try {
        const messages = await fetchProjectIrisMessages(sessionId);
        setProjectIrisRenderSnapshot((current) =>
          buildSessionChatRenderSnapshot({
            messages,
            previousSnapshot: current,
          }),
        );
        setProjectIrisError(projectManageSkill?.available === false ? projectManageSkill.error : null);
      } catch (error) {
        setProjectIrisError(String(error));
      } finally {
        setIsProjectIrisLoading(false);
      }
    },
    [projectManageSkill],
  );

  const handleProjectIrisSessionIdle = useCallback(
    (sessionId: string) => {
      if (sessionId !== projectIrisSessionId) {
        return;
      }

      void loadProjectIrisMessages(sessionId);
    },
    [loadProjectIrisMessages, projectIrisSessionId],
  );

  const projectIrisSessionStatuses = useSessionStatusFeed({
    enabled: Boolean(projectIrisSessionId),
    onSessionIdle: handleProjectIrisSessionIdle,
  });
  const projectIrisSessionStatus = getSessionStatusForId(
    projectIrisSessionStatuses,
    projectIrisSessionId,
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const res = await fetch("/api/projects");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as ProjectsApiData;
      if (data.error) {
        throw new Error(data.error);
      }

      setServerData({ projects: data.projects ?? [] });
    } catch (error) {
      setFetchError(String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loaderData?.initialData || loaderData?.initialFetchError) {
      return;
    }

    void fetchData();
  }, [fetchData, loaderData?.initialData, loaderData?.initialFetchError]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const restored = loadProjectIrisSessionState(window.localStorage);
    setProjectIrisSessionState(restored ?? startNewProjectIrisSession());
    setHasHydratedProjectIrisSession(true);
  }, []);

  useEffect(() => {
    if (!hasHydratedProjectIrisSession || typeof window === "undefined") {
      return;
    }

    persistProjectIrisSessionState(window.localStorage, projectIrisSessionState);
  }, [hasHydratedProjectIrisSession, projectIrisSessionState]);

  useEffect(() => {
    if (!hasHydratedProjectIrisSession) {
      return;
    }

    if (!projectIrisSessionId) {
      setProjectIrisRenderSnapshot(null);
      return;
    }

    void loadProjectIrisMessages(projectIrisSessionId);
  }, [hasHydratedProjectIrisSession, loadProjectIrisMessages, projectIrisSessionId]);

  const handleOpenProjectIrisSheet = useCallback(() => {
    setIsProjectIrisSheetOpen(true);
  }, []);

  const handleNewProjectIrisSession = useCallback(() => {
    setProjectIrisRenderSnapshot(null);
    setProjectIrisSessionState(startNewProjectIrisSession());
    setProjectIrisError(projectManageSkill?.available === false ? projectManageSkill.error : null);
  }, [projectManageSkill]);

  const handleSendProjectIrisPrompt = useCallback(
    async (parts: PromptPart[]) => {
      if (!projectManageSkill?.available || !projectManageSkill.promptContext) {
        setProjectIrisError(projectManageSkill?.error ?? PROJECT_IRIS_UNAVAILABLE_ERROR);
        return;
      }

      setIsProjectIrisSending(true);
      setProjectIrisError(null);

      const promptParts = prependProjectIrisContext(
        {
          helperText: PROJECT_IRIS_HELPER_TEXT,
          projectManagePromptContext: projectManageSkill.promptContext,
        },
        parts,
      );

      try {
        let sessionId = projectIrisSessionId;
        if (sessionId) {
          await sendProjectIrisPrompt({
            model: selectedProjectIrisModel,
            parts: promptParts,
            sessionId,
          });
        } else {
          sessionId = await startProjectIrisSession({
            model: selectedProjectIrisModel,
            parts: promptParts,
          });
        }

        const nextState = createProjectIrisSessionState({
          sessionId,
          updatedAt: new Date().toISOString(),
        });
        setProjectIrisSessionState(nextState);
        await loadProjectIrisMessages(sessionId);
      } catch (error) {
        setProjectIrisError(String(error));
      } finally {
        setIsProjectIrisSending(false);
      }
    },
    [
      loadProjectIrisMessages,
      projectIrisSessionId,
      projectManageSkill,
      selectedProjectIrisModel,
    ],
  );

  if (loading && !serverData) {
    return (
      <div className="flex min-h-75 items-center justify-center p-6">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PageContainer className="space-y-5" size="narrow">
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <p className="text-muted-foreground text-sm">
            Browse the registered project registry. Execution and context assignment now happens on
            each mission or session surface.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button onClick={handleOpenProjectIrisSheet} size="sm" variant="outline">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Manage Projects with Iris
          </Button>
          <Button disabled={loading} onClick={() => void fetchData()} size="sm" title="Refresh" variant="outline">
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {fetchError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load projects</AlertTitle>
          <AlertDescription className="mt-1 flex items-center gap-3">
            <span className="flex-1">{fetchError}</span>
            <Button disabled={loading} onClick={() => void fetchData()} size="sm" variant="outline">
              <RefreshCw className={cn("mr-1 h-3 w-3", loading && "animate-spin")} />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {projectManageSkill?.available === false && projectManageSkill.error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Project management unavailable</AlertTitle>
          <AlertDescription>{projectManageSkill.error}</AlertDescription>
        </Alert>
      ) : null}

      {serverData && serverData.projects.length === 0 && (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <FolderGit2 className="mx-auto h-9 w-9 text-muted-foreground/30" />
            <p className="font-medium text-muted-foreground text-sm">No registered projects found.</p>
            <div>
              <Button onClick={handleOpenProjectIrisSheet} size="sm" variant="outline">
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Manage Projects with Iris
              </Button>
            </div>
            <p className="text-muted-foreground/60 text-xs">Register a project via CLI:</p>
            <code className="mx-auto block w-fit rounded bg-muted px-3 py-1.5 font-mono text-xs">
              scripts/project_register.sh --id &lt;id&gt; ...
            </code>
          </CardContent>
        </Card>
      )}

      {serverData && serverData.projects.length > 0 && (
        <div className="space-y-2">
          {serverData.projects.map((project) => {
            const vscodePreference = vscodePreferences[project.id] ?? "auto";

            return (
              <Card className="border-border/40 bg-card/60" key={project.id}>
                <CardContent className="flex flex-col gap-4 px-4 py-3.5 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-sm">{project.displayName}</span>
                      <code className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {project.id}
                      </code>
                      <span className="inline-flex items-center gap-1 rounded-full border border-border/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                        <GitBranch className="h-3 w-3" />
                        {project.branchName ?? "unknown"}
                      </span>
                    </div>
                    <div className="space-y-0.5 text-xs text-muted-foreground/80">
                      <p className="font-mono" title={project.path}>
                        {formatPath(project.path)}
                      </p>
                      <p>Branch: {project.branchName ?? "unknown"}</p>
                    </div>
                  </div>

                  <WorkspaceLaunchActions
                    path={project.path}
                    stopPropagation={true}
                    vscodePreference={vscodePreference}
                    onVSCodePreferenceChange={(preference) => updateVSCodePreference(project.id, preference)}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ProjectIrisSheet
        error={projectIrisError}
        isLoading={isProjectIrisLoading}
        isOpen={isProjectIrisSheetOpen}
        isSending={isProjectIrisSending}
        onClose={() => setIsProjectIrisSheetOpen(false)}
        onNewSession={handleNewProjectIrisSession}
        onSelectedModelChange={(model) => setAgentModel(PROJECT_IRIS_AGENT_ID, model)}
        onSend={handleSendProjectIrisPrompt}
        renderSnapshot={projectIrisRenderSnapshot}
        selectedModel={selectedProjectIrisModel}
        sessionId={projectIrisSessionId}
        sessionStatus={projectIrisSessionStatus}
        skillAvailable={projectManageSkill?.available !== false}
        skillError={projectManageSkill?.error ?? null}
      />
    </PageContainer>
  );
};

const ProjectsRoute = (props: Route.ComponentProps) => (
  <ProjectsPage loaderData={props.loaderData as ProjectsPageLoaderData} />
);

export default ProjectsRoute;

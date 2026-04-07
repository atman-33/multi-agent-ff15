import { Check, ChevronDown, FolderGit2, FolderOpen, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertCircle, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { PageContainer } from "@/components/page-container";
import type { ActiveProjectsData } from "@/hooks/use-active-projects";
import {
  PROJECT_SCOPE_DESCRIPTIONS,
  PROJECT_SCOPE_LABELS,
  type ProjectScope,
} from "@/lib/project-scopes";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/route";

interface ProjectsApiData extends ActiveProjectsData {
  error?: string;
}

type VSCodePreference = "auto" | "wsl" | "windows";

const VSCODE_PREFERENCE_STORAGE_KEY = "projects_vscode_preferences";
const WINDOWS_MOUNTED_PATH_REGEX = /^\/mnt\/[a-z]\//i;
const VISIBLE_PROJECT_SCOPES: ProjectScope[] = [
  "noctis_team",
  // "lunafreya",
];

const isWindowsMountedPath = (path: string): boolean => WINDOWS_MOUNTED_PATH_REGEX.test(path);

const resolveVSCodeTarget = (path: string, preference: VSCodePreference): "wsl" | "windows" => {
  if (preference === "auto") {
    return isWindowsMountedPath(path) ? "windows" : "wsl";
  }

  return preference;
};

const getPreferenceLabel = (preference: VSCodePreference): string => {
  switch (preference) {
    case "wsl":
      return "WSL";
    case "windows":
      return "Win";
    default:
      return "Auto";
  }
};

const getResolvedTargetLabel = (path: string, preference: VSCodePreference): string =>
  resolveVSCodeTarget(path, preference) === "windows" ? "Windows" : "WSL";

const readVSCodePreferences = (): Record<string, VSCodePreference> => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = localStorage.getItem(VSCODE_PREFERENCE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) => value === "auto" || value === "wsl" || value === "windows"
      )
    ) as Record<string, VSCodePreference>;
  } catch {
    return {};
  }
};

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

const ProjectsPage = (_props: Route.ComponentProps) => {
  const [serverData, setServerData] = useState<ProjectsApiData | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [vscodePreferences, setVSCodePreferences] = useState<Record<string, VSCodePreference>>({});

  useEffect(() => {
    setVSCodePreferences(readVSCodePreferences());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.setItem(VSCODE_PREFERENCE_STORAGE_KEY, JSON.stringify(vscodePreferences));
  }, [vscodePreferences]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: ProjectsApiData = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setServerData(data);
    } catch (e) {
      setFetchError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openFolder = useCallback(async (path: string) => {
    try {
      const res = await fetch("/api/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });

      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        throw new Error((result as { error?: string }).error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      toast.error("Open folder failed", { description: String(e) });
    }
  }, []);

  const openVSCode = useCallback(async (path: string, preference: VSCodePreference) => {
    try {
      const res = await fetch("/api/open-vscode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, preference }),
      });

      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        throw new Error((result as { error?: string }).error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      toast.error("Open in VS Code failed", { description: String(e) });
    }
  }, []);

  const updateVSCodePreference = useCallback((projectId: string, preference: VSCodePreference) => {
    setVSCodePreferences((prev) => ({ ...prev, [projectId]: preference }));
  }, []);

  const handleToggle = async (scope: ProjectScope, projectId: string, nextChecked: boolean) => {
    if (!serverData) {
      return;
    }

    const prevProjectScopes = serverData.projectScopes;
    const prevActiveIds = prevProjectScopes[scope].activeProjectIds;
    const nextActiveIds = nextChecked
      ? [...prevActiveIds, projectId]
      : prevActiveIds.filter((id) => id !== projectId);
    const nextProjectScopes = {
      ...prevProjectScopes,
      [scope]: { activeProjectIds: nextActiveIds },
    };

    setServerData((prev) => (prev ? { ...prev, projectScopes: nextProjectScopes } : prev));
    setSavingIds((prev) => new Set(prev).add(`${scope}:${projectId}`));

    try {
      const res = await fetch("/api/projects/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectScopes: nextProjectScopes,
          currentUpdatedAt: serverData.configUpdatedAt,
        }),
      });
      const result = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          toast.error("Conflict detected", {
            description: `${result.error} Reloading latest state.`,
          });
          await fetchData();
          return;
        }
        setServerData((prev) => (prev ? { ...prev, projectScopes: prevProjectScopes } : prev));
        toast.error("Save failed", { description: result.error });
        return;
      }

      if (result.updatedAt) {
        setServerData((prev) =>
          prev
            ? {
                ...prev,
                configUpdatedAt: result.updatedAt,
                projectScopes: result.projectScopes ?? prev.projectScopes,
              }
            : prev
        );
      }

      toast.success(nextChecked ? "Project activated" : "Project deactivated", {
        description: `${PROJECT_SCOPE_LABELS[scope]} · ${serverData.projects.find((project) => project.id === projectId)?.displayName ?? projectId}`,
      });
      window.dispatchEvent(new CustomEvent("active-projects-changed"));
    } catch (e) {
      setServerData((prev) => (prev ? { ...prev, projectScopes: prevProjectScopes } : prev));
      toast.error("Save failed", { description: String(e) });
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(`${scope}:${projectId}`);
        return next;
      });
    }
  };

  if (loading && !serverData) {
    return (
      <div className="flex min-h-75 items-center justify-center p-6">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const scopeCounts = VISIBLE_PROJECT_SCOPES.map((scope) => ({
    scope,
    count: serverData?.projectScopes[scope].activeProjectIds.length ?? 0,
  }));
  const totalCount = serverData?.projects.length ?? 0;

  return (
    <PageContainer className="space-y-5" size="narrow">
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-muted-foreground text-sm">
            Manage scoped project injection for the Noctis team. Iris is excluded from project
            settings.
          </p>
        </div>

        <Button disabled={loading} onClick={fetchData} size="sm" title="Refresh" variant="outline">
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {fetchError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load projects</AlertTitle>
          <AlertDescription className="mt-1 flex items-center gap-3">
            <span className="flex-1">{fetchError}</span>
            <Button disabled={loading} onClick={fetchData} size="sm" variant="outline">
              <RefreshCw className={cn("mr-1 h-3 w-3", loading && "animate-spin")} />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {serverData && serverData.projects.length === 0 && (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <FolderGit2 className="mx-auto h-9 w-9 text-muted-foreground/30" />
            <p className="font-medium text-muted-foreground text-sm">
              No registered projects found.
            </p>
            <p className="text-muted-foreground/60 text-xs">Register a project via CLI:</p>
            <code className="mx-auto block w-fit rounded bg-muted px-3 py-1.5 font-mono text-xs">
              scripts/project_register.sh --id &lt;id&gt; ...
            </code>
          </CardContent>
        </Card>
      )}

      {serverData && serverData.projects.length > 0 && (
        <div className="space-y-2">
          <div
            className={cn(
              "grid gap-3 px-4 py-1 text-[11px] text-muted-foreground/60 uppercase tracking-widest",
              VISIBLE_PROJECT_SCOPES.length === 1
                ? "grid-cols-[minmax(0,1fr)_120px]"
                : "grid-cols-[minmax(0,1fr)_120px_120px]"
            )}
          >
            <span>Project</span>
            {VISIBLE_PROJECT_SCOPES.map((scope) => (
              <div className="text-center" key={scope} title={PROJECT_SCOPE_DESCRIPTIONS[scope]}>
                {PROJECT_SCOPE_LABELS[scope]}
              </div>
            ))}
          </div>
          {serverData.projects.map((project) => {
            const isActiveInAnyScope = VISIBLE_PROJECT_SCOPES.some((scope) =>
              serverData.projectScopes[scope].activeProjectIds.includes(project.id)
            );
            const vscodePreference = vscodePreferences[project.id] ?? "auto";
            const resolvedTargetLabel = getResolvedTargetLabel(project.path, vscodePreference);
            return (
              <Card
                className={cn(
                  "transition-all duration-150",
                  isActiveInAnyScope
                    ? "border-primary/40 bg-card"
                    : "border-border/40 bg-card/45"
                )}
                key={project.id}
              >
                <CardContent className="flex items-center gap-4 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-2">
                      <span className="truncate font-medium text-sm">{project.displayName}</span>
                      <code className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {project.id}
                      </code>
                    </div>
                    <div className="flex items-center gap-2.5 text-muted-foreground/70 text-xs">
                      <span className="truncate font-mono" title={project.path}>
                        {formatPath(project.path)}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <div className="flex items-center gap-1">
                      <Button
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={(event) => {
                          event.stopPropagation();
                          openFolder(project.path).catch(() => undefined);
                        }}
                        size="icon"
                        title="Open in Explorer"
                        variant="ghost"
                      >
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                      <div className="flex items-center">
                        <Button
                          className="h-8 gap-1 rounded-r-none border-r-0 px-2.5 text-[11px]"
                          onClick={(event) => {
                            event.stopPropagation();
                            openVSCode(project.path, vscodePreference).catch(() => undefined);
                          }}
                          size="sm"
                          title={`Open in VS Code (${getPreferenceLabel(vscodePreference)} -> ${resolvedTargetLabel})`}
                          variant="outline"
                        >
                          <span>VS Code</span>
                          <span className="text-[10px] text-muted-foreground/80">
                            {getPreferenceLabel(vscodePreference)}
                          </span>
                        </Button>

                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              className="h-8 rounded-l-none px-2 text-muted-foreground"
                              onClick={(event) => event.stopPropagation()}
                              size="sm"
                              title="Choose VS Code launch mode"
                              variant="outline"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="end"
                            className="w-60 p-1"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="px-2 py-1.5">
                              <p className="font-medium text-xs">Open in VS Code</p>
                              <p className="text-[11px] text-muted-foreground">
                                Auto uses WSL for Linux paths and Windows for /mnt drives.
                              </p>
                            </div>
                            <div className="grid gap-1">
                              {(
                                [
                                  {
                                    preference: "auto",
                                    label: `Auto (${resolvedTargetLabel})`,
                                    description: "Choose based on the project path.",
                                  },
                                  {
                                    preference: "wsl",
                                    label: "Open in WSL",
                                    description: "Always launch through the WSL code command.",
                                  },
                                  {
                                    preference: "windows",
                                    label: "Open in Windows",
                                    description: "Use native Windows VS Code when possible.",
                                  },
                                ] as const
                              ).map((option) => (
                                <button
                                  className={cn(
                                    "flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left text-xs transition-colors",
                                    vscodePreference === option.preference
                                      ? "bg-accent text-accent-foreground"
                                      : "hover:bg-accent/60"
                                  )}
                                  key={option.preference}
                                  onClick={() => {
                                    updateVSCodePreference(project.id, option.preference);
                                    openVSCode(project.path, option.preference).catch(
                                      () => undefined
                                    );
                                  }}
                                  type="button"
                                >
                                  <div className="flex w-full items-center gap-2">
                                    <span className="font-medium">{option.label}</span>
                                    {vscodePreference === option.preference && (
                                      <Check className="ml-auto h-3.5 w-3.5" />
                                    )}
                                  </div>
                                  <span className="text-[11px] text-muted-foreground">
                                    {option.description}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "grid gap-3",
                        VISIBLE_PROJECT_SCOPES.length === 1 ? "grid-cols-1" : "grid-cols-2"
                      )}
                    >
                      {VISIBLE_PROJECT_SCOPES.map((scope) => {
                        const checked = serverData.projectScopes[scope].activeProjectIds.includes(
                          project.id
                        );
                        const isSaving = savingIds.has(`${scope}:${project.id}`);
                        return (
                          <div className="flex min-w-27.5 items-center justify-center" key={scope}>
                            <Switch
                              aria-label={`Toggle ${project.displayName} for ${PROJECT_SCOPE_LABELS[scope]}`}
                              checked={checked}
                              disabled={isSaving}
                              onCheckedChange={(nextChecked) =>
                                handleToggle(scope, project.id, nextChecked)
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {serverData && serverData.projects.length > 0 && (
        <div className="flex items-center justify-end gap-4 text-right text-muted-foreground/50 text-xs">
          {scopeCounts.map(({ scope, count }) => (
            <p key={scope}>
              {PROJECT_SCOPE_LABELS[scope]}: {count} / {totalCount} active
            </p>
          ))}
        </div>
      )}
    </PageContainer>
  );
};

export default ProjectsPage;

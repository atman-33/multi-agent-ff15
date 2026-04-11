import { FolderGit2, GitBranch, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { WorkspaceLaunchActions } from "@/components/workspace-launch-actions";
import { Alert, AlertCircle, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageContainer } from "@/components/page-container";
import type { ProjectRegistryEntry } from "@/hooks/use-project-registry";
import { useVSCodePreferences } from "@/hooks/use-vscode-preferences";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/route";

interface ProjectsApiData {
  error?: string;
  projects: ProjectRegistryEntry[];
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

const ProjectsPage = (_props: Route.ComponentProps) => {
  const [serverData, setServerData] = useState<ProjectsApiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { vscodePreferences, updateVSCodePreference } = useVSCodePreferences();

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
    void fetchData();
  }, [fetchData]);

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

        <Button disabled={loading} onClick={() => void fetchData()} size="sm" title="Refresh" variant="outline">
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
            <Button disabled={loading} onClick={() => void fetchData()} size="sm" variant="outline">
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
            <p className="font-medium text-muted-foreground text-sm">No registered projects found.</p>
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
    </PageContainer>
  );
};

export default ProjectsPage;

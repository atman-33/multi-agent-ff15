import { FolderGit2, FolderOpen, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Alert,
  AlertCircle,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface ProjectEntry {
  displayName: string;
  id: string;
  path: string;
  updatedAt: string;
}

interface ProjectsApiData {
  activeProjectIds: string[];
  configUpdatedAt: string;
  error?: string;
  projects: ProjectEntry[];
}

const formatPath = (p: string): string => {
  if (!p) {
    return "—";
  }
  if (p.length <= 42) {
    return p;
  }
  const parts = p.split("/");
  if (parts.length >= 3) {
    return `…/${parts.slice(-2).join("/")}`;
  }
  return `…${p.slice(-39)}`;
};

const formatDate = (iso: string): string => {
  if (!iso) {
    return "—";
  }
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

export default function ProjectsPage() {
  const [serverData, setServerData] = useState<ProjectsApiData | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

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

  const handleToggle = async (projectId: string, nextChecked: boolean) => {
    if (!serverData) {
      return;
    }

    // Optimistically update UI
    const prevActiveIds = serverData.activeProjectIds;
    const nextActiveIds = nextChecked
      ? [...prevActiveIds, projectId]
      : prevActiveIds.filter((id) => id !== projectId);

    setServerData((prev) =>
      prev ? { ...prev, activeProjectIds: nextActiveIds } : prev
    );
    setSavingIds((prev) => new Set(prev).add(projectId));

    try {
      const res = await fetch("/api/projects/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeProjectIds: nextActiveIds,
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
        // Revert optimistic update
        setServerData((prev) =>
          prev ? { ...prev, activeProjectIds: prevActiveIds } : prev
        );
        toast.error("Save failed", { description: result.error });
        return;
      }

      // Sync configUpdatedAt from response if available
      // Note: server returns `updatedAt`, not `configUpdatedAt`
      if (result.updatedAt) {
        setServerData((prev) =>
          prev ? { ...prev, configUpdatedAt: result.updatedAt } : prev
        );
      }

      toast.success(nextChecked ? "Project activated" : "Project deactivated", {
        description: serverData.projects.find((p) => p.id === projectId)
          ?.displayName,
      });
      window.dispatchEvent(new CustomEvent("active-projects-changed"));
    } catch (e) {
      // Revert optimistic update
      setServerData((prev) =>
        prev ? { ...prev, activeProjectIds: prevActiveIds } : prev
      );
      toast.error("Save failed", { description: String(e) });
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  };

  // --- Render ---

  if (loading && !serverData) {
    return (
      <div className="flex min-h-[300px] items-center justify-center p-6">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeCount = serverData?.activeProjectIds.length ?? 0;
  const totalCount = serverData?.projects.length ?? 0;

  return (
    <div className="max-w-3xl space-y-5 p-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-semibold text-xl">
            <FolderGit2 className="h-5 w-5 text-primary" />
            Project Settings
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Toggle which projects are injected into agent context on the next
            run.
          </p>
        </div>

        {/* Refresh button */}
        <Button
          disabled={loading}
          onClick={fetchData}
          size="sm"
          title="Refresh"
          variant="outline"
        >
          <RefreshCw
            className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      {/* Fetch error */}
      {fetchError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load projects</AlertTitle>
          <AlertDescription className="mt-1 flex items-center gap-3">
            <span className="flex-1">{fetchError}</span>
            <Button
              disabled={loading}
              onClick={fetchData}
              size="sm"
              variant="outline"
            >
              <RefreshCw
                className={cn("mr-1 h-3 w-3", loading && "animate-spin")}
              />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {serverData && serverData.projects.length === 0 && (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <FolderGit2 className="mx-auto h-9 w-9 text-muted-foreground/30" />
            <p className="font-medium text-muted-foreground text-sm">
              No registered projects found.
            </p>
            <p className="text-muted-foreground/60 text-xs">
              Register a project via CLI:
            </p>
            <code className="mx-auto block w-fit rounded bg-muted px-3 py-1.5 font-mono text-xs">
              scripts/project_register.sh --id &lt;id&gt; ...
            </code>
          </CardContent>
        </Card>
      )}

      {/* Project list */}
      {serverData && serverData.projects.length > 0 && (
        <div className="space-y-2">
          {serverData.projects.map((project) => {
            const isActive = serverData.activeProjectIds.includes(project.id);
            const isSaving = savingIds.has(project.id);
            return (
              <Card
                className={cn(
                  "transition-all duration-150",
                  isActive
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/60"
                )}
                key={project.id}
              >
                <CardContent className="flex items-center gap-4 px-4 py-3.5">
                  {/* Project info */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-2">
                      <span className="truncate font-medium text-sm">
                        {project.displayName}
                      </span>
                      <code className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {project.id}
                      </code>
                    </div>
                    <div className="flex items-center gap-2.5 text-muted-foreground/70 text-xs">
                      <span className="truncate font-mono" title={project.path}>
                        {formatPath(project.path)}
                      </span>
                      {project.updatedAt && (
                        <>
                          <span className="shrink-0">·</span>
                          <span className="shrink-0">
                            {formatDate(project.updatedAt)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right side: open folder + switch */}
                  <div className="flex shrink-0 items-center gap-3">
                    <Button
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        fetch("/api/open-folder", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ path: project.path }),
                        }).catch(console.error);
                      }}
                      size="icon"
                      title="Open in Explorer"
                      variant="ghost"
                    >
                      <FolderOpen className="h-4 w-4" />
                    </Button>

                    <Switch
                      aria-label={`Toggle ${project.displayName}`}
                      checked={isActive}
                      disabled={isSaving}
                      onCheckedChange={(checked) =>
                        handleToggle(project.id, checked)
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Active count summary */}
      {serverData && serverData.projects.length > 0 && (
        <p className="text-right text-muted-foreground/50 text-xs">
          {activeCount} / {totalCount} active
        </p>
      )}
    </div>
  );
}

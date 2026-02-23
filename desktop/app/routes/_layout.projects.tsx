import {
  FolderGit2,
  FolderOpen,
  RefreshCw,
  RotateCcw,
  Save,
} from "lucide-react";
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

function formatPath(p: string): string {
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
}

function formatDate(iso: string): string {
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
}

export default function ProjectsPage() {
  const [serverData, setServerData] = useState<ProjectsApiData | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

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
      setPendingIds(new Set(data.activeProjectIds));
      setIsDirty(false);
    } catch (e) {
      setFetchError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleProject = (id: string) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setIsDirty(true);
  };

  const handleReset = () => {
    if (!serverData) {
      return;
    }
    setPendingIds(new Set(serverData.activeProjectIds));
    setIsDirty(false);
  };

  const handleSave = async () => {
    if (!serverData) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/projects/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeProjectIds: Array.from(pendingIds),
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
        toast.error("Save failed", { description: result.error });
        return;
      }

      // Re-fetch from server to confirm ground truth
      await fetchData();
      toast.success("Active projects saved", {
        description: `${pendingIds.size} project(s) active.`,
      });
      // Broadcast to sidebar chip and other listeners
      window.dispatchEvent(new CustomEvent("active-projects-changed"));
    } catch (e) {
      toast.error("Save failed", { description: String(e) });
    } finally {
      setSaving(false);
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

        {/* Action buttons — always visible */}
        <div className="flex shrink-0 items-center gap-2">
          <Button
            disabled={!isDirty || saving}
            onClick={handleReset}
            size="sm"
            title="Discard unsaved changes"
            variant="outline"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>
          <Button disabled={!isDirty || saving} onClick={handleSave} size="sm">
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Unsaved-changes banner */}
      {isDirty && (
        <div className="flex items-center gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-amber-400 text-sm">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-400" />
          <span>
            Unsaved changes &mdash; this will affect all agent context
            injections on the next run.
          </span>
        </div>
      )}

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
            const isActive = pendingIds.has(project.id);
            return (
              <Card
                className={cn(
                  "cursor-pointer select-none transition-all duration-150",
                  isActive
                    ? "border-primary/40 bg-primary/5"
                    : "hover:border-border/80 hover:bg-white/[0.025]"
                )}
                key={project.id}
                onClick={() => toggleProject(project.id)}
              >
                <CardContent className="flex items-center gap-4 px-4 py-3.5">
                  {/* Checkbox indicator */}
                  <div
                    className={cn(
                      "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border-2 transition-all",
                      isActive
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/40 bg-transparent"
                    )}
                  >
                    {isActive && (
                      <svg
                        className="h-2.5 w-2.5 text-primary-foreground"
                        fill="none"
                        viewBox="0 0 12 12"
                      >
                        <title>Active</title>
                        <path
                          d="M2 6l3 3 5-5"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                        />
                      </svg>
                    )}
                  </div>

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

                  {/* Action buttons */}
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      className="z-10 h-8 w-8 text-muted-foreground hover:text-primary"
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

                    {/* Active badge */}
                    {isActive && (
                      <span className="font-bold text-[10px] text-primary/80 uppercase tracking-widest">
                        Active
                      </span>
                    )}
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
          {pendingIds.size} / {serverData.projects.length} active
          {isDirty && " (unsaved)"}
        </p>
      )}
    </div>
  );
}

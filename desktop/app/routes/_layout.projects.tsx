import { useState, useEffect, useCallback } from "react";
import {
  Save,
  RotateCcw,
  FolderGit2,
  RefreshCw,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AlertCircle,
} from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface ProjectEntry {
  id: string;
  displayName: string;
  path: string;
  updatedAt: string;
}

interface ProjectsApiData {
  activeProjectIds: string[];
  configUpdatedAt: string;
  projects: ProjectEntry[];
  error?: string;
}

function formatPath(p: string): string {
  if (!p) return "—";
  if (p.length <= 42) return p;
  const parts = p.split("/");
  if (parts.length >= 3) return `…/${parts.slice(-2).join("/")}`;
  return "…" + p.slice(-39);
}

function formatDate(iso: string): string {
  if (!iso) return "—";
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ProjectsApiData = await res.json();
      if (data.error) throw new Error(data.error);
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
    if (!serverData) return;
    setPendingIds(new Set(serverData.activeProjectIds));
    setIsDirty(false);
  };

  const handleSave = async () => {
    if (!serverData) return;
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
            description: result.error + " Reloading latest state.",
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
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FolderGit2 className="h-5 w-5 text-primary" />
            Project Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Toggle which projects are injected into agent context on the next
            run.
          </p>
        </div>

        {/* Action buttons — always visible */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!isDirty || saving}
            title="Discard unsaved changes"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || saving}
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Unsaved-changes banner */}
      {isDirty && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-400 flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse" />
          <span>
            Unsaved changes &mdash; this will affect all agent context injections
            on the next run.
          </span>
        </div>
      )}

      {/* Fetch error */}
      {fetchError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load projects</AlertTitle>
          <AlertDescription className="flex items-center gap-3 mt-1">
            <span className="flex-1">{fetchError}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={loading}
            >
              <RefreshCw
                className={cn("h-3 w-3 mr-1", loading && "animate-spin")}
              />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {serverData && serverData.projects.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <FolderGit2 className="h-9 w-9 text-muted-foreground/30 mx-auto" />
            <p className="text-sm font-medium text-muted-foreground">
              No registered projects found.
            </p>
            <p className="text-xs text-muted-foreground/60">
              Register a project via CLI:
            </p>
            <code className="text-xs font-mono bg-muted px-3 py-1.5 rounded block w-fit mx-auto">
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
                key={project.id}
                className={cn(
                  "cursor-pointer select-none transition-all duration-150",
                  isActive
                    ? "border-primary/40 bg-primary/5"
                    : "hover:border-border/80 hover:bg-white/[0.025]"
                )}
                onClick={() => toggleProject(project.id)}
              >
                <CardContent className="py-3.5 px-4 flex items-center gap-4">
                  {/* Checkbox indicator */}
                  <div
                    className={cn(
                      "h-[18px] w-[18px] rounded border-2 flex items-center justify-center shrink-0 transition-all",
                      isActive
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/40 bg-transparent"
                    )}
                  >
                    {isActive && (
                      <svg
                        className="h-2.5 w-2.5 text-primary-foreground"
                        viewBox="0 0 12 12"
                        fill="none"
                      >
                        <path
                          d="M2 6l3 3 5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>

                  {/* Project info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium truncate">
                        {project.displayName}
                      </span>
                      <code className="text-[11px] text-muted-foreground font-mono bg-muted/60 px-1.5 py-0.5 rounded shrink-0">
                        {project.id}
                      </code>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-muted-foreground/70">
                      <span
                        className="font-mono truncate"
                        title={project.path}
                      >
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
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        fetch("/api/open-folder", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ path: project.path }),
                        }).catch(console.error);
                      }}
                      title="Open in Explorer"
                    >
                      <FolderOpen className="h-4 w-4" />
                    </Button>

                    {/* Active badge */}
                    {isActive && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-primary/80">
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
        <p className="text-xs text-muted-foreground/50 text-right">
          {pendingIds.size} / {serverData.projects.length} active
          {isDirty && " (unsaved)"}
        </p>
      )}
    </div>
  );
}

import { AlertTriangle, FolderGit2, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageContainer } from "@/components/page-container";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { getProjectRoot } from "@/lib/get-project-root.server";
import {
  readSharedSkillsState,
  type InvalidSharedSkillSelection,
  type SharedSkillCatalogEntry,
  type SharedSkillsSelection,
} from "@/lib/shared-skills.server";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/route";

interface SkillsPageData {
  invalidSelections: InvalidSharedSkillSelection[];
  selection: SharedSkillsSelection;
  selectionPath: string;
  settingsPath: string;
  sharedSkillsRoot: string;
  skills: SharedSkillCatalogEntry[];
}

type SkillsApiResponse = SkillsPageData & {
  error?: string;
  success?: boolean;
};

const formatPath = (path: string): string => {
  if (!path) {
    return "-";
  }

  if (path.length <= 54) {
    return path;
  }

  const parts = path.split("/");
  if (parts.length >= 3) {
    return `.../${parts.slice(-3).join("/")}`;
  }

  return `...${path.slice(-51)}`;
};

export const loader = async (_args: Route.LoaderArgs) => {
  try {
    return {
      initialData: readSharedSkillsState(getProjectRoot()),
      initialFetchError: null,
    };
  } catch (error) {
    return {
      initialData: null,
      initialFetchError: String(error),
    };
  }
};

export const SkillsPage = ({ loaderData }: Route.ComponentProps) => {
  const [data, setData] = useState<SkillsPageData | null>(loaderData.initialData);
  const [loading, setLoading] = useState(false);
  const [savingSkillIds, setSavingSkillIds] = useState<Set<string>>(new Set());
  const [fetchError, setFetchError] = useState<string | null>(loaderData.initialFetchError);

  useEffect(() => {
    setData(loaderData.initialData);
    setFetchError(loaderData.initialFetchError);
  }, [loaderData.initialData, loaderData.initialFetchError]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const response = await fetch("/api/skills");
      const result = (await response.json()) as SkillsApiResponse;

      if (!response.ok) {
        throw new Error(result.error ?? `HTTP ${response.status}`);
      }

      setData(result);
    } catch (error) {
      setFetchError(String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const persistSelection = useCallback(
    async (nextSelectedSkillIds: string[], toggledSkillId: string, nextEnabled: boolean) => {
      const previousData = data;
      if (!previousData) {
        return;
      }

      setSavingSkillIds((current) => new Set(current).add(toggledSkillId));
      setData({
        ...previousData,
        invalidSelections: [],
        selection: { selectedSkillIds: nextSelectedSkillIds },
      });

      try {
        const response = await fetch("/api/skills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedSkillIds: nextSelectedSkillIds }),
        });
        const result = (await response.json()) as SkillsApiResponse;

        if (!response.ok) {
          throw new Error(result.error ?? `HTTP ${response.status}`);
        }

        setData(result);
        toast.success(nextEnabled ? "Shared skill enabled" : "Shared skill disabled", {
          description: toggledSkillId,
        });
      } catch (error) {
        setData(previousData);
        toast.error("Failed to save shared skills", {
          description: String(error),
        });
      } finally {
        setSavingSkillIds((current) => {
          const next = new Set(current);
          next.delete(toggledSkillId);
          return next;
        });
      }
    },
    [data],
  );

  const handleToggle = useCallback(
    (skillId: string, nextEnabled: boolean) => {
      if (!data) {
        return;
      }

      const catalogIds = new Set(data.skills.map((skill) => skill.id));
      const nextSelectedSkillIds = data.selection.selectedSkillIds.filter((id) =>
        catalogIds.has(id),
      );
      const selectedIds = new Set(nextSelectedSkillIds);

      if (nextEnabled) {
        selectedIds.add(skillId);
      } else {
        selectedIds.delete(skillId);
      }

      void persistSelection([...selectedIds], skillId, nextEnabled);
    },
    [data, persistSelection],
  );

  const selectedCount = data?.skills.filter((skill) =>
    data.selection.selectedSkillIds.includes(skill.id),
  ).length;

  if (loading && !data) {
    return (
      <div className="flex min-h-75 items-center justify-center p-6">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PageContainer className="space-y-5" size="narrow">
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-2xl space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1.5" variant="secondary">
              <Sparkles className="h-3.5 w-3.5" />
              Shared Skills
            </Badge>
            {data ? <Badge variant="outline">{data.settingsPath}</Badge> : null}
            {data ? <Badge variant="outline">{data.selectionPath}</Badge> : null}
          </div>
          <div className="space-y-1">
            <h1 className="font-semibold text-2xl">Shared Skills</h1>
            <p className="text-muted-foreground text-sm">
              Select globally injected skills for prompt composition. Enabled skills are appended to
              every new prompt as shared reference files.
            </p>
            {data ? (
              <p className="text-muted-foreground text-xs">
                Current root: <span className="font-mono">{data.sharedSkillsRoot}</span>
              </p>
            ) : null}
          </div>
        </div>

        <Button disabled={loading} onClick={() => void fetchData()} size="sm" variant="outline">
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {fetchError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Failed to load shared skills</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      ) : null}

      {data?.invalidSelections.length ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Broken saved selections</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>These ids are skipped during prompt composition until you update the selection.</p>
            <div className="flex flex-wrap gap-2">
              {data.invalidSelections.map((entry) => (
                <Badge className="font-mono" key={`${entry.id}:${entry.reason}`} variant="outline">
                  {entry.id}
                </Badge>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {data && data.skills.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <FolderGit2 className="mx-auto h-9 w-9 text-muted-foreground/30" />
            <p className="font-medium text-muted-foreground text-sm">No shared skills found.</p>
            <p className="text-muted-foreground/60 text-xs">
              Save a different root or add <code>SKILL.md</code> directories under the configured
              path.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {data && data.skills.length > 0 ? (
        <div className="space-y-2">
          {data.skills.map((skill) => {
            const isSelected = data.selection.selectedSkillIds.includes(skill.id);
            const isSaving = savingSkillIds.has(skill.id);

            return (
              <Card
                className={cn(
                  "border-border/40 bg-card/60 transition-colors",
                  isSelected && "border-primary/40 bg-card",
                )}
                key={skill.id}
              >
                <CardContent className="flex flex-col gap-4 px-4 py-3.5 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-sm">{skill.name}</span>
                      <Badge className="font-mono" variant="outline">
                        {skill.id}
                      </Badge>
                      <Badge variant={isSelected ? "secondary" : "outline"}>
                        {isSelected ? "Enabled" : "Disabled"}
                      </Badge>
                      {isSaving ? <Badge variant="outline">Saving...</Badge> : null}
                    </div>
                    <p className="text-muted-foreground text-sm">{skill.description}</p>
                    <p className="font-mono text-[11px] text-muted-foreground/80" title={skill.filePath}>
                      {formatPath(skill.filePath)}
                    </p>
                  </div>

                  <Switch
                    checked={isSelected}
                    disabled={isSaving}
                    onCheckedChange={(nextEnabled) => handleToggle(skill.id, nextEnabled)}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      {data && data.skills.length > 0 ? (
        <div className="text-muted-foreground text-xs">
          {selectedCount} of {data.skills.length} shared skills enabled
        </div>
      ) : null}
    </PageContainer>
  );
};

export default SkillsPage;
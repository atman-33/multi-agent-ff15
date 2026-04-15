import { AlertTriangle, Globe2, RefreshCw, Save, Settings2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/page-container";
import { readAppConfig, type AppConfig } from "@/lib/app-config.server";
import { getProjectRoot } from "@/lib/get-project-root.server";
import type { Route } from "./+types/route";

type ConfigField = {
  description: string;
  key: keyof AppConfig;
  label: string;
  placeholder?: string;
  type: "text";
};

type ConfigSection = {
  description: string;
  fields: ConfigField[];
  id: string;
  title: string;
};

interface ConfigApiData {
  config: AppConfig;
  settingsPath: string;
}

const CONFIG_SECTIONS: ConfigSection[] = [
  {
    id: "general",
    title: "General",
    description: "Core application settings stored in config/settings.yaml.",
    fields: [
      {
        key: "sharedSkillsRoot",
        label: "Shared Skills Root",
        description:
          "Repository-relative directory used to discover globally selectable shared skills.",
        placeholder: "skills",
        type: "text",
      },
      {
        key: "language",
        label: "Language",
        description:
          "Language code written to settings.yaml. Examples: ja, en, zh, ko.",
        placeholder: "en",
        type: "text",
      },
    ],
  },
];

export const loader = async (_args: Route.LoaderArgs) => {
  const root = getProjectRoot();

  return {
    config: readAppConfig(root),
    settingsPath: "config/settings.yaml",
  } satisfies ConfigApiData;
};

export const ConfigPage = ({ loaderData }: Route.ComponentProps) => {
  const [data, setData] = useState<ConfigApiData>(loaderData);
  const [draft, setDraft] = useState<AppConfig>(loaderData.config);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    setData(loaderData);
    setDraft(loaderData.config);
  }, [loaderData]);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(data.config),
    [data.config, draft]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const response = await fetch("/api/config");
      const result = (await response.json()) as ConfigApiData & { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? `HTTP ${response.status}`);
      }

      setData(result);
      setDraft(result.config);
    } catch (error) {
      setFetchError(String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);

    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: draft }),
      });
      const result = (await response.json()) as ConfigApiData & { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? `HTTP ${response.status}`);
      }

      setData(result);
      setDraft(result.config);
      toast.success("Configuration saved", {
        description: `${result.settingsPath} was updated.`,
      });
    } catch (error) {
      toast.error("Save failed", { description: String(error) });
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const renderField = (field: ConfigField) => {
    const value = draft[field.key];

    switch (field.type) {
      case "text":
        return (
          <Input
            className="max-w-xs"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                [field.key]: event.target.value,
              }))
            }
            placeholder={field.placeholder}
            value={typeof value === "string" ? value : ""}
          />
        );
      default:
        return null;
    }
  };

  return (
    <PageContainer className="gap-4 p-4" size="wide">
        <div className="flex flex-col gap-3 border-border/50 border-b pb-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="gap-1.5" variant="secondary">
                <Settings2 className="h-3.5 w-3.5" />
                Config
              </Badge>
              <Badge variant="outline">{data.settingsPath}</Badge>
            </div>
            <div>
              <h1 className="font-semibold text-2xl">Configuration</h1>
              <p className="text-muted-foreground text-sm">
                Edit application settings from a single page. New config sections can be added
                here without changing the page structure.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button disabled={loading} onClick={fetchData} size="sm" variant="outline">
              <RefreshCw className={loading ? "animate-spin" : ""} />
              Refresh
            </Button>
            <Button disabled={saving || !isDirty} onClick={handleSave} size="sm">
              <Save />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        {fetchError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Failed to load configuration</AlertTitle>
            <AlertDescription>{fetchError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-h-0 space-y-4 overflow-auto pr-1">
            {CONFIG_SECTIONS.map((section) => (
              <Card key={section.id}>
                <CardHeader>
                  <CardTitle className="text-xl">{section.title}</CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {section.fields.map((field) => (
                    <div
                      className="flex flex-col gap-3 rounded-lg border border-border/50 bg-muted/10 p-4 md:flex-row md:items-center md:justify-between"
                      key={field.key}
                    >
                      <div className="space-y-1">
                        <div className="font-medium text-sm">{field.label}</div>
                        <p className="text-muted-foreground text-sm">{field.description}</p>
                      </div>
                      <div className="md:ml-6">{renderField(field)}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Globe2 className="h-4 w-4 text-primary" />
                  Current Values
                </CardTitle>
                <CardDescription>Live draft values before saving.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                  <div className="text-muted-foreground text-xs uppercase tracking-wide">
                    shared skills root
                  </div>
                  <div className="mt-1 font-mono text-sm">
                    {draft.sharedSkillsRoot || "(default: skills)"}
                  </div>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                  <div className="text-muted-foreground text-xs uppercase tracking-wide">
                    language
                  </div>
                  <div className="mt-1 font-mono text-sm">{draft.language || "(empty)"}</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/10 p-3 text-muted-foreground text-sm">
                  The Noctis Team screens currently treat <span className="font-mono">ja</span> as
                  Japanese mode and all other values as non-Japanese mode.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
    </PageContainer>
  );
};

export default ConfigPage;

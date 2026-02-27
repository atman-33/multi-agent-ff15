import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cpu,
  RefreshCw,
  Terminal,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface McpServerEntry {
  command?: string[];
  enabled?: boolean;
  type?: string;
  url?: string;
}

interface McpConfigData {
  config: {
    mcp?: Record<string, McpServerEntry>;
  } | null;
  error?: string;
}

export default function McpPage() {
  const [data, setData] = useState<McpConfigData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [savingNames, setSavingNames] = useState<Set<string>>(new Set());
  const [expandedNames, setExpandedNames] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/mcp-config");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json: McpConfigData = await res.json();
      if (json.error) {
        throw new Error(json.error);
      }
      setData(json);
    } catch (e) {
      setFetchError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggle = async (name: string, nextEnabled: boolean) => {
    if (!data?.config?.mcp) {
      return;
    }

    // Optimistic update
    setData((prev) => {
      if (!prev?.config?.mcp) {
        return prev;
      }
      return {
        ...prev,
        config: {
          ...prev.config,
          mcp: {
            ...prev.config.mcp,
            [name]: { ...prev.config.mcp[name], enabled: nextEnabled },
          },
        },
      };
    });
    setSavingNames((prev) => new Set(prev).add(name));

    try {
      const res = await fetch("/api/mcp-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, enabled: nextEnabled }),
      });
      const result = await res.json();
      if (!res.ok) {
        // Revert
        setData((prev) => {
          if (!prev?.config?.mcp) {
            return prev;
          }
          return {
            ...prev,
            config: {
              ...prev.config,
              mcp: {
                ...prev.config.mcp,
                [name]: { ...prev.config.mcp[name], enabled: !nextEnabled },
              },
            },
          };
        });
        toast.error("Failed to save", { description: result.error });
        return;
      }
      toast.success(
        nextEnabled ? "MCP server enabled" : "MCP server disabled",
        {
          description: name,
        }
      );
    } catch (e) {
      // Revert
      setData((prev) => {
        if (!prev?.config?.mcp) {
          return prev;
        }
        return {
          ...prev,
          config: {
            ...prev.config,
            mcp: {
              ...prev.config.mcp,
              [name]: { ...prev.config.mcp[name], enabled: !nextEnabled },
            },
          },
        };
      });
      toast.error("Failed to save", { description: String(e) });
    } finally {
      setSavingNames((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  };

  const toggleExpand = (name: string) => {
    setExpandedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  // --- Render ---

  if (loading && !data) {
    return (
      <div className="flex min-h-[300px] items-center justify-center p-6">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const mcpEntries = Object.entries(data?.config?.mcp ?? {});
  const enabledCount = mcpEntries.filter(([, v]) => v.enabled).length;

  return (
    <div className="max-w-3xl space-y-5 p-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-semibold text-xl">
            <Cpu className="h-5 w-5 text-primary" />
            MCP Servers
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Manage Model Context Protocol servers defined in{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
              opencode.json
            </code>
          </p>
        </div>

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
          <AlertTitle>Failed to load MCP config</AlertTitle>
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
      {data && mcpEntries.length === 0 && (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <Cpu className="mx-auto h-9 w-9 text-muted-foreground/30" />
            <p className="font-medium text-muted-foreground text-sm">
              No MCP servers configured.
            </p>
            <p className="text-muted-foreground/60 text-xs">
              Add servers to the <code>mcp</code> section in{" "}
              <code>opencode.json</code>.
            </p>
          </CardContent>
        </Card>
      )}

      {/* MCP server list */}
      {mcpEntries.length > 0 && (
        <div className="space-y-2">
          {mcpEntries.map(([name, entry]) => {
            const isEnabled = entry.enabled ?? false;
            const isSaving = savingNames.has(name);
            const isExpanded = expandedNames.has(name);
            const hasDetails =
              (entry.command && entry.command.length > 0) || entry.url;

            return (
              <Card
                className={cn(
                  "overflow-hidden transition-all duration-150",
                  isEnabled
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/60"
                )}
                key={name}
              >
                {/* Main row */}
                <CardContent className="flex items-center gap-4 px-4 py-3.5">
                  {/* Status icon */}
                  <div className="shrink-0">
                    {isEnabled ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </div>

                  {/* Server info */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm">{name}</span>
                      {entry.type && (
                        <Badge
                          className="px-1.5 py-0 text-[10px]"
                          variant="secondary"
                        >
                          {entry.type}
                        </Badge>
                      )}
                      {!isEnabled && (
                        <Badge
                          className="border-border/40 bg-transparent px-1.5 py-0 text-[10px] text-muted-foreground/60"
                          variant="outline"
                        >
                          disabled
                        </Badge>
                      )}
                    </div>

                    {/* Command / URL preview */}
                    {entry.command && entry.command.length > 0 && (
                      <div className="flex items-center gap-1.5 text-muted-foreground/70 text-xs">
                        <Terminal className="h-3 w-3 shrink-0" />
                        <span className="truncate font-mono">
                          {entry.command.join(" ")}
                        </span>
                      </div>
                    )}
                    {entry.url && (
                      <div className="flex items-center gap-1.5 text-muted-foreground/70 text-xs">
                        <Terminal className="h-3 w-3 shrink-0" />
                        <span className="truncate font-mono">{entry.url}</span>
                      </div>
                    )}
                  </div>

                  {/* Right: expand + switch */}
                  <div className="flex shrink-0 items-center gap-2">
                    {hasDetails && (
                      <button
                        aria-label={
                          isExpanded
                            ? `Collapse ${name} details`
                            : `Expand ${name} details`
                        }
                        className="rounded p-1 text-muted-foreground/50 transition-colors hover:bg-white/5 hover:text-muted-foreground"
                        onClick={() => toggleExpand(name)}
                        type="button"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}

                    <Switch
                      aria-label={`Toggle ${name}`}
                      checked={isEnabled}
                      disabled={isSaving}
                      onCheckedChange={(checked) => handleToggle(name, checked)}
                    />
                  </div>
                </CardContent>

                {/* Expanded detail panel */}
                {isExpanded && hasDetails && (
                  <div className="border-border/40 border-t bg-muted/30 px-4 py-3">
                    <dl className="space-y-2 text-xs">
                      {entry.type && (
                        <div className="flex gap-3">
                          <dt className="w-20 shrink-0 font-medium text-muted-foreground/70">
                            Type
                          </dt>
                          <dd className="font-mono text-foreground/80">
                            {entry.type}
                          </dd>
                        </div>
                      )}
                      {entry.command && entry.command.length > 0 && (
                        <div className="flex gap-3">
                          <dt className="w-20 shrink-0 font-medium text-muted-foreground/70">
                            Command
                          </dt>
                          <dd className="flex flex-wrap gap-1">
                            {entry.command.map((arg, i) => (
                              <code
                                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]"
                                // biome-ignore lint/suspicious/noArrayIndexKey: command args may contain duplicates (e.g. -y flag)
                                key={`${arg}-${i}`}
                              >
                                {arg}
                              </code>
                            ))}
                          </dd>
                        </div>
                      )}
                      {entry.url && (
                        <div className="flex gap-3">
                          <dt className="w-20 shrink-0 font-medium text-muted-foreground/70">
                            URL
                          </dt>
                          <dd className="font-mono text-foreground/80">
                            {entry.url}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Summary */}
      {mcpEntries.length > 0 && (
        <p className="text-right text-muted-foreground/50 text-xs">
          {enabledCount} / {mcpEntries.length} enabled
        </p>
      )}
    </div>
  );
}

import { exec } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  AlertTriangle,
  Cpu,
  LayoutGrid,
  Loader2,
  Save,
  Search,
  UserCircle2,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Await, useFetcher, useLoaderData } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const execAsync = promisify(exec);

const CONFIG_PATH = join(homedir(), ".config/opencode/oh-my-opencode.json");

interface Config {
  agents?: Record<string, { model: string; variant?: string }>;
  categories?: Record<string, { model: string; variant?: string }>;
}

interface DeferredData {
  isInstalled: Promise<boolean>;
  models: Promise<string[]>;
  version: Promise<string>;
}

interface LoaderData {
  config: Config | null;
  deferred: DeferredData;
  error?: string;
}

export async function loader() {
  let config: Config | null = null;
  let error: string | undefined;

  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = readFileSync(CONFIG_PATH, "utf-8");
      config = JSON.parse(raw);
    } catch (e) {
      error = "Failed to parse config: " + String(e);
    }
  } else {
    error = "Configuration file not found at " + CONFIG_PATH;
  }

  const isInstalledPromise = async () => {
    try {
      await execAsync("oh-my-opencode --version");
      return true;
    } catch (e) {
      return false;
    }
  };

  const versionPromise = async () => {
    try {
      const { stdout } = await execAsync("oh-my-opencode --version");
      return stdout.trim();
    } catch (e) {
      return "unknown";
    }
  };

  const modelsPromise = async () => {
    try {
      const { stdout } = await execAsync("opencode models");
      return stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(
          (line) =>
            line &&
            !line.startsWith("opencode") &&
            !line.includes("--") &&
            line.includes("/")
        );
    } catch (e) {
      return [];
    }
  };

  return {
    config,
    error,
    deferred: {
      isInstalled: isInstalledPromise(),
      version: versionPromise(),
      models: modelsPromise(),
    },
  };
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
      {[...Array(6)].map((_, i) => (
        <div
          className="flex animate-pulse items-center gap-3 rounded-md border border-border/10 bg-card/10 p-1.5 px-3"
          key={i}
        >
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="flex-1" />
          <div className="h-7 w-[220px] rounded bg-muted sm:w-[280px] 2xl:w-[320px]" />
        </div>
      ))}
    </div>
  );
}

export default function OhMyOpenCodeSettings() {
  const data = useLoaderData<LoaderData>();
  const fetcher = useFetcher();
  const [config, setConfig] = useState<Config>(data.config || {});
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (data.config) {
      setConfig(data.config);
    }
  }, [data.config]);

  <Suspense fallback={null}>
    <Await resolve={data.deferred.isInstalled}>
      {(isInstalled) =>
        !isInstalled && (
          <div className="flex h-[60vh] flex-col items-center justify-center space-y-4 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <div className="max-w-md">
              <h2 className="mb-2 font-bold text-xl">
                oh-my-opencode Not Found
              </h2>
              <p className="text-muted-foreground text-sm">
                It seems `oh-my-opencode` is not installed or not in your PATH.
                Version check failed. Please install it to use this
                configuration page.
              </p>
            </div>
            <Button
              onClick={() => window.location.reload()}
              size="sm"
              variant="outline"
            >
              Retry Check
            </Button>
          </div>
        )
      }
    </Await>
  </Suspense>;

  const handleModelChange = (
    type: "agents" | "categories",
    key: string,
    model: string
  ) => {
    setConfig((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [key]: {
          ...prev[type]?.[key],
          model,
        },
      },
    }));
  };

  const handleSave = () => {
    fetcher.submit(
      { config: JSON.stringify(config) },
      { method: "POST", action: "/api/oh-my-opencode/config" }
    );
  };

  useEffect(() => {
    if (fetcher.data?.success) {
      toast.success("Configuration saved successfully");
    } else if (fetcher.data?.error) {
      toast.error(`Save failed: ${fetcher.data.error}`);
    }
  }, [fetcher.data]);

  const filteredAgents = Object.entries(config.agents || {}).filter(([key]) =>
    key.toLowerCase().includes(search.toLowerCase())
  );

  const filteredCategories = Object.entries(config.categories || {}).filter(
    ([key]) => key.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fade-in slide-in-from-bottom-4 mx-auto max-w-[1600px] animate-in space-y-4 p-4 duration-500">
      <Suspense
        fallback={
          <div className="pointer-events-none space-y-4 opacity-50">
            <div className="flex items-center justify-between border-border/50 border-b pb-2">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
                <h1 className="font-bold text-lg text-muted-foreground italic tracking-tight">
                  Syncing models...
                </h1>
              </div>
            </div>
            <LoadingGrid />
          </div>
        }
      >
        <Await
          resolve={Promise.all([
            data.deferred.isInstalled,
            data.deferred.version,
            data.deferred.models,
          ])}
        >
          {([isInstalled, version, models]) =>
            isInstalled ? (
              <>
                <div className="flex items-center justify-between border-border/50 border-b pb-2">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Cpu className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h1 className="font-bold text-lg tracking-tight">
                        oh-my-opencode Models
                      </h1>
                      <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                        Configuration v{version}
                      </p>
                    </div>
                  </div>
                  <Button
                    className="h-8 px-4 text-[11px] shadow-md"
                    disabled={fetcher.state === "submitting"}
                    onClick={handleSave}
                    size="sm"
                  >
                    {fetcher.state === "submitting" ? (
                      "Saving..."
                    ) : (
                      <>
                        <Save className="mr-1.5 h-3.5 w-3.5" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>

                <div className="group relative">
                  <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground/50 transition-colors group-focus-within:text-primary" />
                  <input
                    className="h-9 w-full rounded-lg border-border/50 bg-muted/20 px-3 pl-10 text-sm ring-1 ring-border/50 transition-all placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter agents or categories..."
                    value={search}
                  />
                </div>

                <div className="grid grid-cols-1 gap-x-8 gap-y-4 xl:grid-cols-2">
                  {/* Agents Section */}
                  <section className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2 pl-1 font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
                        <UserCircle2 className="h-3.5 w-3.5 text-primary/70" />
                        Agents
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground/60">
                        {filteredAgents.length} items
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                      {filteredAgents.map(([key, value]) => (
                        <div
                          className="group flex items-center gap-3 rounded-md border border-border/30 bg-card/30 p-1.5 px-3 transition-all duration-150 hover:border-primary/30 hover:bg-card/50"
                          key={key}
                        >
                          <div
                            className="min-w-0 flex-1 truncate font-medium text-[12px] text-foreground/80"
                            title={key}
                          >
                            {key}
                          </div>
                          <div className="flex shrink-0 items-center">
                            <Select
                              onValueChange={(val) =>
                                handleModelChange("agents", key, val)
                              }
                              value={value.model}
                            >
                              <SelectTrigger className="h-7 w-[220px] border-border/50 bg-background/40 text-[11px] sm:w-[280px] 2xl:w-[320px]">
                                <SelectValue placeholder="Model" />
                              </SelectTrigger>
                              <SelectContent>
                                {models.map((m) => (
                                  <SelectItem
                                    className="py-1 text-[11px]"
                                    key={m}
                                    value={m}
                                  >
                                    {m}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))}
                      {filteredAgents.length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/5 p-4 text-[11px] italic opacity-40">
                          No agents matching search
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Categories Section */}
                  <section className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2 pl-1 font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
                        <LayoutGrid className="h-3.5 w-3.5 text-primary/70" />
                        Categories
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground/60">
                        {filteredCategories.length} items
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                      {filteredCategories.map(([key, value]) => (
                        <div
                          className="group flex items-center gap-3 rounded-md border border-border/30 bg-card/30 p-1.5 px-3 transition-all duration-150 hover:border-primary/30 hover:bg-card/50"
                          key={key}
                        >
                          <div
                            className="min-w-0 flex-1 truncate font-medium text-[12px] text-foreground/80"
                            title={key}
                          >
                            {key}
                          </div>
                          <div className="flex shrink-0 items-center">
                            <Select
                              onValueChange={(val) =>
                                handleModelChange("categories", key, val)
                              }
                              value={value.model}
                            >
                              <SelectTrigger className="h-7 w-[220px] border-border/50 bg-background/40 text-[11px] sm:w-[280px] 2xl:w-[320px]">
                                <SelectValue placeholder="Model" />
                              </SelectTrigger>
                              <SelectContent>
                                {models.map((m) => (
                                  <SelectItem
                                    className="py-1 text-[11px]"
                                    key={m}
                                    value={m}
                                  >
                                    {m}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))}
                      {filteredCategories.length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/5 p-4 text-[11px] italic opacity-40">
                          No categories matching search
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </>
            ) : null
          }
        </Await>
      </Suspense>
    </div>
  );
}

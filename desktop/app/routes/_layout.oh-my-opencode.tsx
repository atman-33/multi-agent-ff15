import { ActionFunctionArgs, useLoaderData, useFetcher, Await } from "react-router";
import { useState, useEffect, Suspense } from "react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  Cpu,
  Save,
  AlertTriangle,
  Search,
  LayoutGrid,
  UserCircle2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const execAsync = promisify(exec);

const CONFIG_PATH = join(homedir(), ".config/opencode/oh-my-opencode.json");

interface Config {
  agents?: Record<string, { model: string; variant?: string; }>;
  categories?: Record<string, { model: string; variant?: string; }>;
}

interface DeferredData {
  isInstalled: Promise<boolean>;
  version: Promise<string>;
  models: Promise<string[]>;
}

interface LoaderData {
  config: Config | null;
  error?: string;
  deferred: DeferredData;
}

export async function loader() {
  let config: Config | null = null;
  let error: string | undefined = undefined;

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
        .filter((line) => line && !line.startsWith("opencode") && !line.includes("--") && line.includes("/"));
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2 gap-1.5">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-1.5 px-3 rounded-md bg-card/10 border border-border/10 animate-pulse"
        >
          <div className="h-4 bg-muted rounded w-24" />
          <div className="flex-1" />
          <div className="h-7 bg-muted rounded w-[220px] sm:w-[280px] 2xl:w-[320px]" />
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
      {(isInstalled) => !isInstalled && (
        <div className="flex flex-col items-center justify-center h-[60vh] p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <div className="max-w-md">
            <h2 className="text-xl font-bold mb-2">oh-my-opencode Not Found</h2>
            <p className="text-muted-foreground text-sm">
              It seems `oh-my-opencode` is not installed or not in your PATH.
              Version check failed. Please install it to use this configuration page.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Retry Check
          </Button>
        </div>
      )}
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

  const filteredCategories = Object.entries(config.categories || {}).filter(([key]) =>
    key.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-[1600px] mx-auto p-4 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Suspense fallback={
        <div className="space-y-4 opacity-50 pointer-events-none">
          <div className="flex items-center justify-between pb-2 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              </div>
              <h1 className="text-lg font-bold tracking-tight text-muted-foreground italic">Syncing models...</h1>
            </div>
          </div>
          <LoadingGrid />
        </div>
      }>
        <Await resolve={Promise.all([data.deferred.isInstalled, data.deferred.version, data.deferred.models])}>
          {([isInstalled, version, models]) => isInstalled ? (
            <>
              <div className="flex items-center justify-between pb-2 border-b border-border/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Cpu className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold tracking-tight">oh-my-opencode Models</h1>
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">
                      Configuration v{version}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleSave}
                  disabled={fetcher.state === "submitting"}
                  size="sm"
                  className="shadow-md h-8 text-[11px] px-4"
                >
                  {fetcher.state === "submitting" ? (
                    "Saving..."
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>

              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
                <input
                  placeholder="Filter agents or categories..."
                  className="w-full pl-10 h-9 rounded-lg bg-muted/20 border-border/50 ring-1 ring-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 text-sm px-3 placeholder:text-muted-foreground/50 transition-all"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-4">
                {/* Agents Section */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">
                      <UserCircle2 className="w-3.5 h-3.5 text-primary/70" />
                      Agents
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground/60">{filteredAgents.length} items</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2 gap-1.5">
                    {filteredAgents.map(([key, value]) => (
                      <div
                        key={key}
                        className="group flex items-center gap-3 p-1.5 px-3 rounded-md bg-card/30 border border-border/30 hover:border-primary/30 hover:bg-card/50 transition-all duration-150"
                      >
                        <div className="font-medium text-[12px] text-foreground/80 truncate flex-1 min-w-0" title={key}>
                          {key}
                        </div>
                        <div className="shrink-0 flex items-center">
                          <Select
                            value={value.model}
                            onValueChange={(val) => handleModelChange("agents", key, val)}
                          >
                            <SelectTrigger className="w-[220px] sm:w-[280px] 2xl:w-[320px] h-7 bg-background/40 text-[11px] border-border/50">
                              <SelectValue placeholder="Model" />
                            </SelectTrigger>
                            <SelectContent>
                              {models.map((m) => (
                                <SelectItem key={m} value={m} className="text-[11px] py-1">
                                  {m}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                    {filteredAgents.length === 0 && (
                      <div className="col-span-full flex flex-col items-center justify-center p-4 border border-dashed rounded-lg bg-muted/5 opacity-40 text-[11px] italic">
                        No agents matching search
                      </div>
                    )}
                  </div>
                </section>

                {/* Categories Section */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">
                      <LayoutGrid className="w-3.5 h-3.5 text-primary/70" />
                      Categories
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground/60">{filteredCategories.length} items</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2 gap-1.5">
                    {filteredCategories.map(([key, value]) => (
                      <div
                        key={key}
                        className="group flex items-center gap-3 p-1.5 px-3 rounded-md bg-card/30 border border-border/30 hover:border-primary/30 hover:bg-card/50 transition-all duration-150"
                      >
                        <div className="font-medium text-[12px] text-foreground/80 truncate flex-1 min-w-0" title={key}>
                          {key}
                        </div>
                        <div className="shrink-0 flex items-center">
                          <Select
                            value={value.model}
                            onValueChange={(val) => handleModelChange("categories", key, val)}
                          >
                            <SelectTrigger className="w-[220px] sm:w-[280px] 2xl:w-[320px] h-7 bg-background/40 text-[11px] border-border/50">
                              <SelectValue placeholder="Model" />
                            </SelectTrigger>
                            <SelectContent>
                              {models.map((m) => (
                                <SelectItem key={m} value={m} className="text-[11px] py-1">
                                  {m}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                    {filteredCategories.length === 0 && (
                      <div className="col-span-full flex flex-col items-center justify-center p-4 border border-dashed rounded-lg bg-muted/5 opacity-40 text-[11px] italic">
                        No categories matching search
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </>
          ) : null}
        </Await>
      </Suspense>
    </div>
  );
}

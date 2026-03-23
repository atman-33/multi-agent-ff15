import {
  Activity,
  CheckCircle2,
  Cpu,
  Crown,
  FileText,
  FolderGit2,
  GitBranch,
  Github,
  LoaderCircle,
  ServerCrash,
  Settings2,
  Terminal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigation } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { type ProjectEntry, useActiveProjects } from "@/hooks/use-active-projects";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/route";

type NavItem = {
  to: string;
  icon: typeof Crown;
  label: string;
  end?: boolean;
};

type HeaderServerStatus = {
  checkedAt: string;
  error: string | null;
  isRunning: boolean;
  lastStartedAt: string | null;
  managedByApp: boolean;
  state: "down" | "running" | "starting";
  url: string;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/noctis-team", icon: Crown, label: "Noctis Team" },
  { to: "/opencode", icon: Terminal, label: "OpenCode", end: true },
  { to: "/reports", icon: FileText, label: "Reports", end: true },
  { to: "/projects", icon: FolderGit2, label: "Projects", end: true },
  { to: "/mcp", icon: Cpu, label: "MCP", end: true },
  { to: "/oh-my-opencode", icon: Settings2, label: "OMO Config" },
  { to: "/server", icon: Activity, label: "Server Monitor", end: true },
];

function formatActiveProjectLabel(
  projects: ProjectEntry[],
  isLoading: boolean,
  error: string | null
) {
  if (isLoading && projects.length === 0) {
    return "Noctis Team: checking";
  }

  if (error && projects.length === 0) {
    return "Noctis Team: unavailable";
  }

  if (projects.length === 0) {
    return "Noctis Team: none";
  }

  if (projects.length === 1) {
    const [project] = projects;
    return `Noctis Team: ${project.displayName} / ${project.branchName ?? "unknown"}`;
  }

  const [firstProject] = projects;
  return `Noctis Team: ${firstProject.displayName} / ${firstProject.branchName ?? "unknown"} +${projects.length - 1}`;
}

function formatActiveProjectTitle(projects: ProjectEntry[], error: string | null) {
  if (projects.length === 0) {
    return error ?? "No active projects for Noctis Team";
  }

  return projects
    .map((project) => `${project.displayName} (${project.id}) / ${project.branchName ?? "unknown"}`)
    .join("\n");
}

function formatProjectUpdatedAt(value: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function getServerStatusLabel(status: HeaderServerStatus | null) {
  if (!status) {
    return "OpenCode: checking";
  }

  if (status.state === "running") {
    return "OpenCode: running";
  }

  if (status.state === "starting") {
    return "OpenCode: starting";
  }

  return "OpenCode: down";
}

function areServerStatusesEqual(left: HeaderServerStatus | null, right: HeaderServerStatus) {
  if (!left) {
    return false;
  }

  return (
    left.checkedAt === right.checkedAt &&
    left.error === right.error &&
    left.isRunning === right.isRunning &&
    left.lastStartedAt === right.lastStartedAt &&
    left.managedByApp === right.managedByApp &&
    left.state === right.state &&
    left.url === right.url
  );
}

const Layout = (_props: Route.ComponentProps) => {
  const navigation = useNavigation();
  const location = useLocation();
  const isLoading = navigation.state !== "idle";
  const {
    data: activeProjectsData,
    loading: activeProjectsLoading,
    error: activeProjectsError,
  } = useActiveProjects();
  const [serverStatus, setServerStatus] = useState<HeaderServerStatus | null>(null);
  const [isRecoveringServer, setIsRecoveringServer] = useState(false);

  const isNavItemActive = (to: string, end?: boolean) => {
    if (end) {
      return location.pathname === to;
    }

    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };

  const activeNavItem =
    NAV_ITEMS.find((item) => isNavItemActive(item.to, item.end)) ?? null;
  const activeNavLabel = activeNavItem?.label ?? "Multi-Agent";
  const ActiveNavIcon = activeNavItem?.icon ?? Crown;

  const activeNoctisProjects = useMemo(() => {
    const activeIds = activeProjectsData?.projectScopes.noctis_team.activeProjectIds ?? [];
    const activeIdSet = new Set(activeIds);
    return (activeProjectsData?.projects ?? []).filter((project) => activeIdSet.has(project.id));
  }, [activeProjectsData]);
  const primaryActiveProject = activeNoctisProjects[0] ?? null;
  const additionalActiveProjectCount = Math.max(activeNoctisProjects.length - 1, 0);

  const fetchServerStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/opencode/server");
      const data = (await response.json()) as HeaderServerStatus;

      if (!response.ok) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }

      setServerStatus((current) => (areServerStatusesEqual(current, data) ? current : data));
    } catch (error) {
      const nextStatus = {
        checkedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        isRunning: false,
        lastStartedAt: null,
        managedByApp: false,
        state: "down" as const,
        url: "",
      };

      setServerStatus((current) =>
        areServerStatusesEqual(current, nextStatus) ? current : nextStatus
      );
    }
  }, []);

  useEffect(() => {
    fetchServerStatus();
    const intervalId = window.setInterval(fetchServerStatus, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchServerStatus]);

  const handleRecoverServer = useCallback(async () => {
    if (isRecoveringServer) {
      return;
    }

    setIsRecoveringServer(true);

    try {
      const response = await fetch("/api/opencode/server", {
        method: "POST",
      });
      const data = (await response.json()) as HeaderServerStatus;

      setServerStatus(data);

      if (!response.ok || !data.isRunning) {
        throw new Error(data.error ?? "Failed to recover OpenCode server");
      }

      toast.success("OpenCode server recovered", {
        description: data.managedByApp
          ? "A managed server process is now running."
          : "Connected to an existing server instance.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Failed to recover OpenCode server", {
        description: message,
      });
      await fetchServerStatus();
    } finally {
      setIsRecoveringServer(false);
    }
  }, [fetchServerStatus, isRecoveringServer]);

  const activeProjectLabel = formatActiveProjectLabel(
    activeNoctisProjects,
    activeProjectsLoading,
    activeProjectsError
  );
  const serverStatusLabel = getServerStatusLabel(serverStatus);
  const serverStatusTitle =
    serverStatus?.state === "down"
      ? (serverStatus?.error ?? "OpenCode server is down. Click to recover.")
      : (serverStatus?.error ?? serverStatus?.url ?? "Checking OpenCode server health");

  return (
    <SidebarProvider defaultOpen className="relative h-full min-h-0 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "url('/images/backgrounds/background-1.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-background/80" />

      <Sidebar
        collapsible="icon"
        mobileSheet={false}
        className="z-10 border-border/50 bg-background/30 backdrop-blur-sm"
      >
        <SidebarHeader className="border-border/50 border-b px-3 py-3 group-data-[collapsible=icon]:px-2">
          <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center">
              <img
                alt="FF15"
                className="h-8 w-8 object-contain"
                src="/favicons/favicon-32x32.png"
              />
            </div>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <div className="font-semibold text-sm leading-none">FF15</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground leading-none">
                Multi-Agent
              </div>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup className="px-2 py-3">
            <SidebarMenu>
              {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isNavItemActive(to, end)}
                    tooltip={label}
                    className="h-10 gap-2.5 rounded-md px-3 text-sm"
                  >
                    <NavLink to={to} end={end} className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="font-medium">{label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarSeparator className="bg-border/50" />

        <SidebarFooter className="px-2 py-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="Repository"
                className="h-9 gap-2.5 rounded-md px-3 text-muted-foreground/70"
              >
                <a
                  href="https://github.com/atman-33/multi-agent-ff15"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="h-4 w-4 shrink-0" />
                  <span className="font-mono text-[10px]">Repository</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {isLoading && (
          <div className="absolute top-0 right-0 left-0 z-50 h-0.5 overflow-hidden bg-primary/20">
            <div className="h-full w-1/3 animate-pulse bg-primary" />
          </div>
        )}

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-border/40 border-b bg-background/20 px-3 py-2 backdrop-blur-sm">
          <SidebarTrigger className="shrink-0" />
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <ActiveNavIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold text-sm text-foreground">{activeNavLabel}</div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                Workspace view
              </div>
            </div>
          </div>

          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            <HoverCard openDelay={120} closeDelay={80}>
              <HoverCardTrigger asChild>
                <NavLink
                  aria-label={activeProjectLabel}
                  className={cn(
                    "group flex min-w-0 max-w-full items-center gap-2.5 rounded-xl border px-2.5 py-1.5 text-left shadow-sm transition-all duration-200",
                    primaryActiveProject &&
                      "border-amber-500/30 bg-amber-500/10 hover:border-amber-400/50 hover:bg-amber-500/15",
                    activeProjectsLoading &&
                      activeNoctisProjects.length === 0 &&
                      "border-primary/20 bg-primary/10 hover:bg-primary/15",
                    activeProjectsError &&
                      activeNoctisProjects.length === 0 &&
                      "border-destructive/30 bg-destructive/10 hover:bg-destructive/15",
                    !primaryActiveProject &&
                      !activeProjectsLoading &&
                      !activeProjectsError &&
                      "border-border/60 bg-background/55 hover:bg-background/75"
                  )}
                  end
                  title={formatActiveProjectTitle(activeNoctisProjects, activeProjectsError)}
                  to="/projects"
                >
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors",
                      primaryActiveProject &&
                        "border-amber-500/30 bg-amber-950/40 text-amber-300",
                      activeProjectsLoading &&
                        activeNoctisProjects.length === 0 &&
                        "border-primary/20 bg-primary/15 text-primary",
                      activeProjectsError &&
                        activeNoctisProjects.length === 0 &&
                        "border-destructive/30 bg-destructive/15 text-destructive",
                      !primaryActiveProject &&
                        !activeProjectsLoading &&
                        !activeProjectsError &&
                        "border-border/60 bg-background/70 text-muted-foreground"
                    )}
                  >
                    {activeProjectsLoading && activeNoctisProjects.length === 0 ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FolderGit2 className="h-3.5 w-3.5" />
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em]",
                        primaryActiveProject
                          ? "bg-amber-500/15 text-amber-700/80 dark:text-amber-300/80"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      Noctis
                    </span>

                    {activeProjectsLoading && activeNoctisProjects.length === 0 ? (
                      <div className="truncate font-semibold text-foreground/90 text-sm">
                        Checking active projects...
                      </div>
                    ) : activeProjectsError && activeNoctisProjects.length === 0 ? (
                      <div className="truncate font-semibold text-destructive text-sm">
                        Active projects unavailable
                      </div>
                    ) : primaryActiveProject ? (
                      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                        <span className="truncate font-semibold text-foreground text-sm">
                          {primaryActiveProject.displayName}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-950/70 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                          <GitBranch className="h-2.5 w-2.5" />
                          {primaryActiveProject.branchName ?? "unknown"}
                        </span>
                        {additionalActiveProjectCount > 0 && (
                          <span className="shrink-0 rounded-full bg-amber-300 px-1.5 py-0.5 font-black text-[9px] text-amber-950">
                            +{additionalActiveProjectCount}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="truncate font-semibold text-foreground/85 text-sm">
                        No active project
                      </div>
                    )}
                  </div>
                </NavLink>
              </HoverCardTrigger>
              <HoverCardContent
                align="end"
                className="w-104 overflow-hidden border-amber-500/20 bg-background/95 p-0 backdrop-blur-md"
                sideOffset={10}
              >
                <div className="border-border/50 border-b bg-amber-500/5 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium text-foreground text-sm">
                        Noctis Team Active Projects
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {formatActiveProjectTitle(activeNoctisProjects, activeProjectsError)}
                      </div>
                    </div>
                    {activeNoctisProjects.length > 0 && (
                      <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-1 font-semibold text-[10px] text-amber-700 dark:text-amber-300">
                        {activeNoctisProjects.length} active
                      </span>
                    )}
                  </div>
                </div>

                {activeNoctisProjects.length > 0 ? (
                  <div className="max-h-80 overflow-y-auto py-1">
                    {activeNoctisProjects.map((project) => (
                      <div
                        className="group px-4 py-3 transition-colors hover:bg-amber-500/10"
                        key={project.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate font-semibold text-foreground text-sm transition-colors group-hover:text-amber-600 dark:group-hover:text-amber-300">
                                {project.displayName}
                              </span>
                              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                {project.id}
                              </span>
                            </div>

                            <div
                              className="mt-1 truncate font-mono text-[10px] text-muted-foreground opacity-80"
                              title={project.path}
                            >
                              {project.path}
                            </div>
                          </div>

                          <span className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300">
                            <GitBranch className="h-2.5 w-2.5" />
                            {project.branchName ?? "unknown"}
                          </span>
                        </div>

                        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="uppercase tracking-[0.14em] text-[9px]">
                            Updated
                          </span>
                          <span className="text-foreground/90">
                            {formatProjectUpdatedAt(project.updatedAt)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-3 text-muted-foreground text-sm">
                    {activeProjectsError ??
                      "No active project is configured for the Noctis Team scope."}
                  </div>
                )}
              </HoverCardContent>
            </HoverCard>

            <button
              className="disabled:cursor-default"
              disabled={serverStatus?.state !== "down" || isRecoveringServer}
              onClick={handleRecoverServer}
              title={serverStatusTitle}
              type="button"
            >
              <Badge
                className={cn(
                  "gap-1 font-normal text-[11px] transition-colors",
                  serverStatus?.state === "running" &&
                    "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                  (serverStatus?.state === "starting" || isRecoveringServer) &&
                    "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                  (!serverStatus || serverStatus.state === "down") &&
                    "border-destructive/30 bg-destructive/15 text-destructive shadow-sm",
                  serverStatus?.state === "down" &&
                    !isRecoveringServer &&
                    "cursor-pointer hover:bg-destructive/20"
                )}
                variant="outline"
              >
                {serverStatus?.state === "running" ? (
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                ) : serverStatus?.state === "starting" || isRecoveringServer ? (
                  <LoaderCircle className="h-3 w-3 shrink-0 animate-spin" />
                ) : (
                  <ServerCrash className="h-3 w-3 shrink-0" />
                )}
                <span>
                  {isRecoveringServer
                    ? "OpenCode: recovering"
                    : serverStatus?.state === "down"
                      ? "OpenCode: down - click to recover"
                      : serverStatusLabel}
                </span>
              </Badge>
            </button>
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </div>
      </main>
    </SidebarProvider>
  );
};

export default Layout;

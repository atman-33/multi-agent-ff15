import {
  Activity,
  CheckCircle2,
  Cpu,
  Crown,
  FileText,
  FolderGit2,
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

  const activeNavLabel =
    NAV_ITEMS.find((item) => isNavItemActive(item.to, item.end))?.label ?? "Multi-Agent";

  const activeNoctisProjects = useMemo(() => {
    const activeIds = activeProjectsData?.projectScopes.noctis_team.activeProjectIds ?? [];
    const activeIdSet = new Set(activeIds);
    return (activeProjectsData?.projects ?? []).filter((project) => activeIdSet.has(project.id));
  }, [activeProjectsData]);

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
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/20">
              <img
                alt="FF15"
                className="h-4 w-4 object-contain"
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
          <span className="font-medium text-sm text-foreground/85">{activeNavLabel}</span>

          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            <HoverCard openDelay={120} closeDelay={80}>
              <HoverCardTrigger asChild>
                <Badge
                  className="max-w-full cursor-default gap-1 border-primary/20 bg-primary/10 font-normal text-[11px] text-foreground/85"
                  variant="outline"
                >
                  <Crown className="h-3 w-3 shrink-0 text-primary/80" />
                  <span className="truncate">{activeProjectLabel}</span>
                </Badge>
              </HoverCardTrigger>
              <HoverCardContent align="end" className="w-90 space-y-3 p-3" sideOffset={10}>
                <div className="space-y-1">
                  <div className="font-medium text-sm text-foreground">
                    Noctis Team Active Projects
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {formatActiveProjectTitle(activeNoctisProjects, activeProjectsError)}
                  </div>
                </div>

                {activeNoctisProjects.length > 0 ? (
                  <div className="space-y-2">
                    {activeNoctisProjects.map((project) => (
                      <div
                        className="rounded-lg border border-border/60 bg-background/70 px-3 py-2.5"
                        key={project.id}
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-sm text-foreground">
                            {project.displayName}
                          </span>
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {project.id}
                          </span>
                        </div>

                        <div className="mt-2 grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
                          <span className="text-muted-foreground">Branch</span>
                          <span className="truncate font-mono text-foreground/90">
                            {project.branchName ?? "unknown"}
                          </span>

                          <span className="text-muted-foreground">Path</span>
                          <span
                            className="truncate font-mono text-foreground/90"
                            title={project.path}
                          >
                            {project.path}
                          </span>

                          <span className="text-muted-foreground">Updated</span>
                          <span className="text-foreground/90">
                            {formatProjectUpdatedAt(project.updatedAt)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
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

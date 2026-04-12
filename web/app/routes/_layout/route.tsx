import {
  Activity,
  Bug,
  CheckCircle2,
  Cpu,
  Crown,
  FileText,
  FolderGit2,
  Github,
  LoaderCircle,
  Sparkles,
  Rabbit,
  ServerCrash,
  SlidersHorizontal,
  Settings2,
  Terminal,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigation } from "react-router";
import { toast } from "sonner";
import { APP_NAVIGATION_FLAGS } from "@/constants/app-navigation";
import { Badge } from "@/components/ui/badge";
import { RouteTransitionOverlay } from "@/components/route-transition-overlay";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/route";

type NavItem = {
  to: string;
  icon: typeof Crown;
  label: string;
  end?: boolean;
};

type NavGroup = {
  id: string;
  items: NavItem[];
  label: string;
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

const OH_MY_OPENCODE_NAV_ITEM: NavItem = {
  to: "/oh-my-opencode",
  icon: Settings2,
  label: "OMO Config",
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { to: "/noctis-team", icon: Crown, label: "Noctis Team" },
      { to: "/lunafreya", icon: Sparkles, label: "Lunafreya" },
      { to: "/opencode", icon: Terminal, label: "OpenCode", end: true },
      { to: "/reports", icon: FileText, label: "Reports", end: true },
      { to: "/projects", icon: FolderGit2, label: "Projects", end: true },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { to: "/mcp", icon: Cpu, label: "MCP", end: true },
      { to: "/config", icon: SlidersHorizontal, label: "Config", end: true },
      ...(APP_NAVIGATION_FLAGS.showOhMyOpencodeConfigInSidebar
        ? [OH_MY_OPENCODE_NAV_ITEM]
        : []),
      { to: "/server", icon: Activity, label: "Server Monitor", end: true },
    ],
  },
  {
    id: "debug",
    label: "Debug",
    items: [
      { to: "/operation-debug", icon: Bug, label: "Operation Debug", end: true },
      { to: "/loading-lab", icon: Rabbit, label: "Loading Lab", end: true },
    ],
  },
];

const NAV_ITEMS = [
  ...NAV_GROUPS.flatMap((group) => group.items),
  ...(!APP_NAVIGATION_FLAGS.showOhMyOpencodeConfigInSidebar
    ? [OH_MY_OPENCODE_NAV_ITEM]
    : []),
];

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
  const location = useLocation();
  const navigation = useNavigation();
  const [serverStatus, setServerStatus] = useState<HeaderServerStatus | null>(null);
  const [isRecoveringServer, setIsRecoveringServer] = useState(false);
  const activePathname = navigation.location?.pathname ?? location.pathname;

  const isNavItemActive = (to: string, end?: boolean) => {
    if (end) {
      return activePathname === to;
    }

    return activePathname === to || activePathname.startsWith(`${to}/`);
  };

  const activeNavItem =
    NAV_ITEMS.find((item) => isNavItemActive(item.to, item.end)) ?? null;
  const activeNavLabel = activeNavItem?.label ?? "Multi-Agent";
  const ActiveNavIcon = activeNavItem?.icon ?? Crown;

  const fetchServerStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/opencode-server");
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
      const response = await fetch("/api/opencode-server", {
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
          {NAV_GROUPS.map((group, index) => (
            <SidebarGroup className="px-2 py-2" key={group.id}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map(({ to, icon: Icon, label, end }) => (
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
              </SidebarGroupContent>
              {index < NAV_GROUPS.length - 1 ? <SidebarSeparator className="mt-2 bg-border/40" /> : null}
            </SidebarGroup>
          ))}
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

        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <RouteTransitionOverlay />
          <Outlet />
        </div>
      </main>
    </SidebarProvider>
  );
};

export default Layout;

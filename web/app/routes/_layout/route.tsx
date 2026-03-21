import {
  Activity,
  Cpu,
  Crown,
  FileText,
  FolderGit2,
  Github,
  Settings2,
  Terminal,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigation } from "react-router";
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
import type { Route } from "./+types/route";

type NavItem = {
  to: string;
  icon: typeof Crown;
  label: string;
  end?: boolean;
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

const Layout = (_props: Route.ComponentProps) => {
  const navigation = useNavigation();
  const location = useLocation();
  const isLoading = navigation.state !== "idle";

  const isNavItemActive = (to: string, end?: boolean) => {
    if (end) {
      return location.pathname === to;
    }

    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };

  const activeNavLabel =
    NAV_ITEMS.find((item) => isNavItemActive(item.to, item.end))?.label ?? "Multi-Agent";

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

        <div className="flex shrink-0 items-center gap-2 border-border/40 border-b bg-background/20 px-3 py-2 backdrop-blur-sm">
          <SidebarTrigger className="shrink-0" />
          <span className="font-medium text-sm text-foreground/85">{activeNavLabel}</span>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </div>
      </main>
    </SidebarProvider>
  );
};

export default Layout;

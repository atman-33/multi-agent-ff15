import { Cpu, FileText, FolderGit2, Github, Settings2, Terminal } from "lucide-react";
import { NavLink, Outlet, useNavigation } from "react-router";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/route";

const Layout = (_props: Route.ComponentProps) => {
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <aside
        className="flex shrink-0 flex-col border-border/50 border-r"
        style={{ width: "var(--sidebar-width)" }}
      >
        <div className="border-border/50 border-b px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/20">
              <span className="font-bold text-primary text-xs">FF</span>
            </div>
            <div>
              <div className="font-semibold text-sm leading-none">FF15</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground leading-none">
                Multi-Agent
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-3">
          {[
            { to: "/opencode", icon: Terminal, label: "OpenCode" },
            { to: "/reports", icon: FileText, label: "Reports" },
            { to: "/projects", icon: FolderGit2, label: "Projects" },
            { to: "/mcp", icon: Cpu, label: "MCP" },
            { to: "/oh-my-opencode", icon: Settings2, label: "OMO Config" },
          ].map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  isActive
                    ? "border border-primary/20 bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="font-medium">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-border/50 border-t px-4 py-3">
          <a
            href="https://github.com/atman-33/multi-agent-ff15"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            <Github className="h-3.5 w-3.5" />
            <span className="font-mono text-[10px]">Repository</span>
          </a>
        </div>
      </aside>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {isLoading && (
          <div className="absolute top-0 right-0 left-0 z-50 h-0.5 overflow-hidden bg-primary/20">
            <div className="h-full w-1/3 animate-pulse bg-primary" />
          </div>
        )}
        <main className="h-full min-h-0 min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;

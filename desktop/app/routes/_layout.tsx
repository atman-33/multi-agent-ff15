import {
  Activity,
  FileText,
  FolderGit2,
  LayoutDashboard,
  MessagesSquare,
  Settings2,
} from "lucide-react";
import { NavLink, Outlet, useNavigation } from "react-router";
import { AppHeader } from "@/components/AppHeader";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Chat",
    to: "/chat",
    icon: MessagesSquare,
  },
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Projects",
    to: "/projects",
    icon: FolderGit2,
  },
  {
    label: "Reports",
    to: "/reports",
    icon: FileText,
  },
  {
    label: "Models",
    to: "/oh-my-opencode",
    icon: Settings2,
  },
  {
    label: "Health",
    to: "/health",
    icon: Activity,
  },
];

export default function Layout() {
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <aside
        className="flex shrink-0 flex-col border-border/50 border-r"
        style={{ width: "var(--sidebar-width)" }}
      >
        {/* Logo area */}
        <div className="border-border/50 border-b px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/20">
              <img
                alt="FF15"
                className="h-4 w-4 object-contain"
                src="/favicons/favicon-32x32.png"
              />
            </div>
            <div>
              <div className="font-semibold text-sm leading-none">FF15</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground leading-none">
                Multi-Agent
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 px-2 py-3" role="navigation">
          {navItems.map((item) => (
            <NavLink
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 font-medium text-sm transition-all duration-150",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  isActive
                    ? "border border-primary/20 bg-primary/15 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )
              }
              key={item.to}
              to={item.to}
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-border/50 border-t px-4 py-3">
          <p className="font-mono text-[10px] text-muted-foreground/60">
            v0.1.0
          </p>
        </div>
      </aside>

      {/* Main content: header + page */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Progress bar */}
        {isLoading && (
          <div className="absolute top-0 right-0 left-0 z-50 h-0.5 overflow-hidden bg-primary/20">
            <div className="h-full w-1/3 animate-progress-indeterminate bg-primary" />
          </div>
        )}
        <AppHeader />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { NavLink, Outlet } from "react-router";
import {
  LayoutDashboard,
  Activity,
  Zap,
  MessagesSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Chat",
    to: "/chat",
    icon: MessagesSquare,
  },
  {
    label: "Health",
    to: "/health",
    icon: Activity,
  },
];

export default function Layout() {
  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <aside
        className="shrink-0 flex flex-col border-r border-border/50"
        style={{ width: "var(--sidebar-width)" }}
      >
        {/* Logo area */}
        <div className="px-4 py-4 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
              <Zap className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-none">FF15</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 leading-none">
                Multi-Agent
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5" role="navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  isActive
                    ? "bg-primary/15 text-primary border border-primary/20 shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                )
              }
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
        <div className="px-4 py-3 border-t border-border/50">
          <p className="text-[10px] text-muted-foreground/60 font-mono">
            v0.1.0
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}


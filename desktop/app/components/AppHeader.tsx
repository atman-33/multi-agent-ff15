import { NavLink, useLocation } from "react-router";
import { FolderGit2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveProjects } from "@/lib/useActiveProjects";

const routeLabels: Record<string, string> = {
  "/chat": "Chat",
  "/dashboard": "Dashboard",
  "/projects": "Projects",
  "/health": "Health",
  "/messages/noctis": "Messages — Noctis",
  "/messages/lunafreya": "Messages — Lunafreya",
};

/**
 * AppHeader — shared top bar rendered above every page.
 *
 * Left  : current page title (breadcrumb-style)
 * Right : Active Project chip → links to /projects
 *
 * Add more right-side slots here as requirements grow.
 */
export function AppHeader() {
  const location = useLocation();
  const { data: projectsData } = useActiveProjects();

  const pageLabel = routeLabels[location.pathname] ?? "";

  // Active project chip
  const activeIds = projectsData?.activeProjectIds ?? [];
  const projects = projectsData?.projects ?? [];
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));

  const chipTooltip =
    activeIds.length > 1
      ? activeIds.map((id) => projectById[id]?.displayName ?? id).join(", ")
      : activeIds.length === 1
        ? (projectById[activeIds[0]]?.displayName ?? activeIds[0])
        : undefined;

  return (
    <header className="z-10 flex items-center justify-between gap-4 h-11 px-5 shrink-0 border-b border-border/50 bg-background/80 backdrop-blur-sm">
      {/* Left: page breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
        <span className="text-muted-foreground/50 text-xs font-mono">FF15</span>
        {pageLabel && (
          <>
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/30" />
            <span className="font-medium text-foreground/80 truncate">
              {pageLabel}
            </span>
          </>
        )}
      </div>

      {/* Right: slots — Active Project chip */}
      <div className="flex items-center gap-2 shrink-0">
        <NavLink
          to="/projects"
          title={chipTooltip}
          className={cn(
            "flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold tracking-tight",
            "border transition-all duration-200 transform-gpu",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            activeIds.length > 0
              ? "border-amber-500/30 bg-amber-500/10 text-amber-500 shadow-sm hover:bg-amber-500/20 hover:border-amber-500/50 hover:scale-[1.02]"
              : "border-border/40 bg-muted/30 text-muted-foreground/40 hover:bg-muted/50 hover:text-muted-foreground italic"
          )}
        >
          <FolderGit2
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              activeIds.length > 0 ? "text-amber-500" : "text-muted-foreground/40"
            )}
          />
          <div className="flex items-center gap-1.5 truncate max-w-[280px]">
            {projectsData === null ? (
              <span>…</span>
            ) : activeIds.length === 0 ? (
              <span>No active project</span>
            ) : (
              <>
                <span className="truncate max-w-[120px]">
                  {projectById[activeIds[0]]?.displayName ?? activeIds[0]}
                </span>
                {projectById[activeIds[0]]?.branchName && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-[10px] font-mono font-bold uppercase tracking-widest text-amber-500/80">
                    {projectById[activeIds[0]].branchName}
                  </span>
                )}
                {activeIds.length > 1 && (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-amber-950 text-[9px] font-black shadow-inner">
                    +{activeIds.length - 1}
                  </span>
                )}
              </>
            )}
          </div>
        </NavLink>
      </div>
    </header>
  );
}

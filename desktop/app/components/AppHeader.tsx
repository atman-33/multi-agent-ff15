import { NavLink, useLocation } from "react-router";
import { FolderGit2, ChevronRight, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveProjects } from "@/lib/useActiveProjects";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

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
        <HoverCard openDelay={200} closeDelay={150}>
          <HoverCardTrigger asChild>
            <NavLink
              to="/projects"
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold tracking-tight",
                "border transition-all duration-200 transform-gpu cursor-pointer",
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
                    <span className="truncate max-w-[140px]">
                      {projectById[activeIds[0]]?.displayName ?? activeIds[0]}
                    </span>
                    {projectById[activeIds[0]]?.branchName && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-[10px] font-mono font-bold uppercase tracking-widest text-amber-500/80">
                        {projectById[activeIds[0]].branchName}
                      </span>
                    )}
                    {activeIds.length > 1 && (
                      <div className="flex items-center gap-1 ml-0.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-amber-950 text-[9px] font-black shadow-inner">
                        <Layers className="h-2 w-2" />
                        <span>+{activeIds.length - 1}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </NavLink>
          </HoverCardTrigger>
          {activeIds.length > 0 && (
            <HoverCardContent align="end" className="w-80 p-0 overflow-hidden border-amber-500/20 bg-card/95 backdrop-blur-md">
              <div className="px-4 py-3 border-b border-border/50 bg-amber-500/5">
                <h4 className="text-xs font-bold uppercase tracking-widest text-amber-500/80 flex items-center gap-2">
                  <FolderGit2 className="h-3 w-3" />
                  Active Projects
                </h4>
              </div>
              <div className="max-h-[300px] overflow-y-auto py-1">
                {activeIds.map((id) => {
                  const p = projectById[id];
                  return (
                    <div key={id} className="px-4 py-2 hover:bg-amber-500/10 transition-colors flex flex-col gap-0.5 group">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground/90 truncate group-hover:text-amber-500 transition-colors">
                          {p?.displayName ?? id}
                        </span>
                        {p?.branchName && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-[9px] font-mono font-bold text-amber-500/70 border border-amber-500/20">
                            {p.branchName}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate font-mono opacity-50">
                        {p?.path ?? "Unknown path"}
                      </span>
                    </div>
                  );
                })}
              </div>
              {activeIds.length > 1 && (
                <div className="px-4 py-2 border-t border-border/50 bg-muted/30">
                  <p className="text-[10px] text-muted-foreground italic">
                    {activeIds.length} projects are currently active.
                  </p>
                </div>
              )}
            </HoverCardContent>
          )}
        </HoverCard>
      </div>
    </header>
  );
}

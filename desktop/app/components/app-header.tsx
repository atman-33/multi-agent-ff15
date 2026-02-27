import { ChevronRight, FolderGit2, Layers } from "lucide-react";
import { NavLink, useLocation } from "react-router";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useActiveProjects } from "@/hooks/use-active-projects";
import { cn } from "@/lib/utils";

const routeLabels: Record<string, string> = {
  "/": "Home",
  "/chat": "Chat",
  "/board": "Board",
  "/crystal-inbox": "Crystal Inbox",
  "/worklog": "Worklog",
  "/reports": "Reports",
  "/projects": "Projects",
  "/mcp": "MCP",
  "/oh-my-opencode": "Models",
  "/monitor": "Monitor",
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

  let chipTooltip = "";
  if (activeIds.length > 1) {
    chipTooltip = activeIds
      .map((id) => projectById[id]?.displayName ?? id)
      .join(", ");
  } else if (activeIds.length === 1) {
    chipTooltip = projectById[activeIds[0]]?.displayName ?? activeIds[0];
  }

  return (
    <header className="z-10 flex h-11 shrink-0 items-center justify-between gap-4 border-border/50 border-b bg-background/80 px-5 backdrop-blur-sm">
      {/* Left: page breadcrumb */}
      <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-sm">
        <span className="font-mono text-muted-foreground/50 text-xs">FF15</span>
        {pageLabel && (
          <>
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/30" />
            <span className="truncate font-medium text-foreground/80">
              {pageLabel}
            </span>
          </>
        )}
      </div>

      {/* Right: slots — Active Project chip */}
      <div className="flex shrink-0 items-center gap-2">
        <HoverCard closeDelay={150} openDelay={200}>
          <HoverCardTrigger asChild>
            <NavLink
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1 font-semibold text-xs tracking-tight",
                "transform-gpu cursor-pointer border transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                activeIds.length > 0
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-500 shadow-sm hover:scale-[1.02] hover:border-amber-500/50 hover:bg-amber-500/20"
                  : "border-border/40 bg-muted/30 text-muted-foreground/40 italic hover:bg-muted/50 hover:text-muted-foreground"
              )}
              title={chipTooltip}
              to="/projects"
            >
              <FolderGit2
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  activeIds.length > 0
                    ? "text-amber-500"
                    : "text-muted-foreground/40"
                )}
              />
              <div className="flex max-w-[280px] items-center gap-1.5 truncate">
                {projectsData === null && <span>…</span>}
                {projectsData !== null && activeIds.length === 0 && (
                  <span>No active project</span>
                )}
                {projectsData !== null && activeIds.length > 0 && (
                  <>
                    <span className="max-w-[140px] truncate">
                      {projectById[activeIds[0]]?.displayName ?? activeIds[0]}
                    </span>
                    {projectById[activeIds[0]]?.branchName && (
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-bold font-mono text-[10px] text-amber-500/80 uppercase tracking-widest">
                        {projectById[activeIds[0]].branchName}
                      </span>
                    )}
                    {activeIds.length > 1 && (
                      <div className="ml-0.5 flex items-center gap-1 rounded-full bg-amber-500 px-1.5 py-0.5 font-black text-[9px] text-amber-950 shadow-inner">
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
            <HoverCardContent
              align="end"
              className="w-80 overflow-hidden border-amber-500/20 bg-card/95 p-0 backdrop-blur-md"
            >
              <div className="border-border/50 border-b bg-amber-500/5 px-4 py-3">
                <h4 className="flex items-center gap-2 font-bold text-amber-500/80 text-xs uppercase tracking-widest">
                  <FolderGit2 className="h-3 w-3" />
                  Active Projects
                </h4>
              </div>
              <div className="max-h-[300px] overflow-y-auto py-1">
                {activeIds.map((id) => {
                  const p = projectById[id];
                  return (
                    <div
                      className="group flex flex-col gap-0.5 px-4 py-2 transition-colors hover:bg-amber-500/10"
                      key={id}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-foreground/90 text-sm transition-colors group-hover:text-amber-500">
                          {p?.displayName ?? id}
                        </span>
                        {p?.branchName && (
                          <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 font-bold font-mono text-[9px] text-amber-500/70">
                            {p.branchName}
                          </span>
                        )}
                      </div>
                      <span className="truncate font-mono text-[10px] text-muted-foreground opacity-50">
                        {p?.path ?? "Unknown path"}
                      </span>
                    </div>
                  );
                })}
              </div>
              {activeIds.length > 1 && (
                <div className="border-border/50 border-t bg-muted/30 px-4 py-2">
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

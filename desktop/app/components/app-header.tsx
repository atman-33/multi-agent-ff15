import { ChevronRight, FolderGit2, Layers } from "lucide-react";
import { NavLink, useLocation } from "react-router";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useActiveProjects } from "@/hooks/use-active-projects";
import {
  PROJECT_SCOPES,
  PROJECT_SCOPE_LABELS,
  type ProjectScope,
} from "@/lib/project-scopes";
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

  const projects = projectsData?.projects ?? [];
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));

  const renderScopeChip = (scope: ProjectScope) => {
    const activeIds = projectsData?.projectScopes[scope]?.activeProjectIds ?? [];
    const chipTooltip = activeIds.map((id) => projectById[id]?.displayName ?? id).join(", ");

    return (
      <HoverCard closeDelay={150} key={scope} openDelay={200}>
        <HoverCardTrigger asChild>
          <NavLink
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1 font-semibold text-xs tracking-tight",
              "transform-gpu cursor-pointer border transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              activeIds.length > 0
                ? "border-amber-500/30 bg-amber-500/10 text-amber-500 shadow-sm hover:scale-[1.02] hover:border-amber-500/50 hover:bg-amber-500/20"
                : "border-border/40 bg-muted/30 text-muted-foreground/50 hover:bg-muted/50"
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
            <div className="flex max-w-[220px] items-center gap-1.5 truncate">
              <span className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground/70">
                {PROJECT_SCOPE_LABELS[scope]}
              </span>
              {projectsData === null && <span>…</span>}
              {projectsData !== null && activeIds.length === 0 && (
                <span className="truncate text-muted-foreground/70">No project</span>
              )}
              {projectsData !== null && activeIds.length > 0 && (
                <>
                  <span className="max-w-[110px] truncate">
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
                {PROJECT_SCOPE_LABELS[scope]}
              </h4>
            </div>
            <div className="max-h-[300px] overflow-y-auto py-1">
              {activeIds.map((id) => {
                const project = projectById[id];
                return (
                  <div
                    className="group flex flex-col gap-0.5 px-4 py-2 transition-colors hover:bg-amber-500/10"
                    key={id}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-foreground/90 text-sm transition-colors group-hover:text-amber-500">
                        {project?.displayName ?? id}
                      </span>
                      {project?.branchName && (
                        <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 font-bold font-mono text-[9px] text-amber-500/70">
                          {project.branchName}
                        </span>
                      )}
                    </div>
                    <span className="truncate font-mono text-[10px] text-muted-foreground opacity-50">
                      {project?.path ?? "Unknown path"}
                    </span>
                  </div>
                );
              })}
            </div>
          </HoverCardContent>
        )}
      </HoverCard>
    );
  };

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

      {/* Right: slots — scoped project chips */}
      <div className="flex shrink-0 items-center gap-2">
        {PROJECT_SCOPES.map((scope) => renderScopeChip(scope))}
      </div>
    </header>
  );
}

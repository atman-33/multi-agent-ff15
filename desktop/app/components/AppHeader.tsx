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
  const nameById = Object.fromEntries(
    (projectsData?.projects ?? []).map((p) => [p.id, p.displayName])
  );

  let chipLabel: string;
  if (projectsData === null) {
    chipLabel = "…";
  } else if (activeIds.length === 0) {
    chipLabel = "No active project";
  } else if (activeIds.length === 1) {
    chipLabel = nameById[activeIds[0]] ?? activeIds[0];
  } else {
    const first = nameById[activeIds[0]] ?? activeIds[0];
    chipLabel = `${first} +${activeIds.length - 1}`;
  }

  const chipTooltip =
    activeIds.length > 1
      ? activeIds.map((id) => nameById[id] ?? id).join(", ")
      : activeIds.length === 1
        ? (nameById[activeIds[0]] ?? activeIds[0])
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

      {/* Right: slots — add more items here as needed */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Active Project chip */}
        <NavLink
          to="/projects"
          title={chipTooltip}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            "border transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            activeIds.length > 0
              ? "border-primary/25 bg-primary/8 text-primary/80 hover:bg-primary/15 hover:border-primary/40 hover:text-primary"
              : "border-border/50 bg-muted/40 text-muted-foreground/50 hover:bg-muted/70 hover:text-muted-foreground italic"
          )}
        >
          <FolderGit2
            className={cn(
              "h-3 w-3 shrink-0",
              activeIds.length > 0 ? "text-primary/70" : "text-muted-foreground/40"
            )}
          />
          <span className="max-w-[180px] truncate">{chipLabel}</span>
        </NavLink>
      </div>
    </header>
  );
}

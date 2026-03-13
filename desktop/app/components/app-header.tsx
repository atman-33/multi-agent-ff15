import { ChevronRight } from "lucide-react";
import { useLocation } from "react-router";

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

  const pageLabel = routeLabels[location.pathname] ?? "";

  return (
    <header className="z-10 flex h-11 shrink-0 items-center gap-4 border-border/50 border-b bg-background/80 px-5 backdrop-blur-sm">
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
    </header>
  );
}

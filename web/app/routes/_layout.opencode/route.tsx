import { MessagesSquare, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import type { Route } from "./+types/route";

type Session = {
  id: string;
  title: string;
  time: {
    created: number;
    updated: number;
  };
  directory: string;
};

const formatRelativeTime = (value: number) => {
  const diffMs = Date.now() - value;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const OpenCodeLayout = ({ loaderData }: Route.ComponentProps) => {
  const params = useParams();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>(loaderData.sessions ?? []);
  const [isFetching, setIsFetching] = useState(false);
  const setCurrentSessionId = useChatStore((state) => state.setCurrentSessionId);
  const activeSessionId = params.id;

  const loadSessions = useCallback(async () => {
    setIsFetching(true);
    try {
      const response = await fetch("/api/sessions");
      if (!response.ok) {
        throw new Error("Failed to load sessions");
      }
      const data = (await response.json()) as { sessions: Session[] };
      setSessions(data.sessions ?? []);
    } catch {
      toast.error("Unable to load sessions", {
        description: "OpenCode server not available",
      });
      setSessions([]);
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    setSessions(loaderData.sessions ?? []);
  }, [loaderData.sessions]);

  useEffect(() => {
    if (activeSessionId) {
      setCurrentSessionId(activeSessionId);
    }
  }, [activeSessionId, setCurrentSessionId]);

  const handleNewSession = useCallback(async () => {
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Session" }),
      });
      if (!response.ok) {
        throw new Error("Failed to create session");
      }
      const data = (await response.json()) as { session: Session };
      await loadSessions();
      if (data.session?.id) {
        navigate(`/opencode/session/${data.session.id}`);
      }
    } catch {
      toast.error("Unable to create session", {
        description: "OpenCode server not available",
      });
    }
  }, [loadSessions, navigate]);

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => b.time.updated - a.time.updated);
  }, [sessions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleRefresh = () => {
      loadSessions();
    };
    window.addEventListener("sessions:refresh", handleRefresh);
    return () => {
      window.removeEventListener("sessions:refresh", handleRefresh);
    };
  }, [loadSessions]);

  return (
    <div className="flex h-full overflow-hidden">
      <aside className="flex w-64 shrink-0 flex-col border-border/50 border-r bg-background">
        <div className="flex items-center justify-between border-border/50 border-b px-3 py-3">
          <span className="text-xs font-semibold text-muted-foreground">Sessions</span>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={loadSessions}
              disabled={isFetching}
              title="Refresh sessions"
            >
              <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={handleNewSession}
              disabled={isFetching}
              title="New session"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 px-2 py-2">
          <nav className="space-y-1">
            {sortedSessions.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
                No sessions yet. Create one to get started.
              </div>
            ) : (
              sortedSessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return (
                  <NavLink
                    key={session.id}
                    to={`/opencode/session/${session.id}`}
                    className={() =>
                      cn(
                        "flex items-start gap-2 rounded-md px-3 py-2 text-sm transition-all",
                        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        isActive
                          ? "border border-primary/20 bg-primary/15 text-primary"
                          : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                      )
                    }
                  >
                    <MessagesSquare className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-xs text-foreground">
                        {session.title || "Untitled"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatRelativeTime(session.time.updated)}
                      </div>
                    </div>
                  </NavLink>
                );
              })
            )}
          </nav>
        </ScrollArea>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
};

export const loader = async ({ request }: Route.LoaderArgs) => {
  try {
    const url = new URL(request.url);
    const response = await fetch(`${url.origin}/api/sessions`);
    if (!response.ok) {
      return { sessions: [] };
    }
    const data = (await response.json()) as { sessions: Session[] };
    return { sessions: data.sessions ?? [] };
  } catch {
    return { sessions: [] };
  }
};

export default OpenCodeLayout;

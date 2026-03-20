import { Github, MessagesSquare, Plus } from "lucide-react";
import { NavLink, Outlet, useNavigation, useNavigate, useParams } from "react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import { toast } from "sonner";
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

const Layout = ({ loaderData }: Route.ComponentProps) => {
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";
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
    } catch (error) {
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
        navigate(`/session/${data.session.id}`);
      }
    } catch (error) {
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

        <div className="px-3 py-3">
          <Button
            size="sm"
            className="w-full justify-start gap-2"
            onClick={handleNewSession}
            disabled={isFetching}
          >
            <Plus className="h-4 w-4" />
            New Session
          </Button>
        </div>

        <div className="px-3 pb-2 text-[11px] font-semibold text-muted-foreground">
          Sessions
        </div>

        <ScrollArea className="flex-1 px-2 pb-4">
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
                    to={`/session/${session.id}`}
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

      <div className="relative flex flex-1 flex-col overflow-hidden">
        {isLoading && (
          <div className="absolute top-0 right-0 left-0 z-50 h-0.5 overflow-hidden bg-primary/20">
            <div className="h-full w-1/3 animate-pulse bg-primary" />
          </div>
        )}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
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

export default Layout;

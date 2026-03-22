import { Check, LoaderCircle, MessagesSquare, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  coerceSessionStatus,
  fetchSessionStatuses,
  isSessionStatusActive,
  type SessionStatus,
} from "@/lib/session-status";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import type { Route } from "./+types/route";

type EventPayload = {
  type: string;
  properties: {
    sessionID?: string;
    status?: {
      type: SessionStatus;
      attempt?: number;
      message?: string;
      next?: number;
    };
    part?: {
      type: string;
      text?: string;
      messageID?: string;
      sessionID?: string;
    };
    delta?: string;
  };
};

type Session = {
  id: string;
  title: string;
  time: {
    created: number;
    updated: number;
  };
  directory: string;
};

export type OpenCodeOutletContext = {
  sessions: Session[];
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

type SessionNavItemProps = {
  session: Session;
  isActive: boolean;
  isRunning: boolean;
  isEditing: boolean;
  isRenaming: boolean;
  onBeginRename: (session: Session) => void;
  onCancelRename: () => void;
  onSubmitRename: (sessionId: string, title: string) => void;
};

const SessionNavItem = memo(
  ({
    session,
    isActive,
    isRunning,
    isEditing,
    isRenaming,
    onBeginRename,
    onCancelRename,
    onSubmitRename,
  }: SessionNavItemProps) => {
    const [draftTitle, setDraftTitle] = useState(session.title || "Untitled");

    useEffect(() => {
      if (isEditing) {
        setDraftTitle(session.title || "Untitled");
      }
    }, [isEditing, session.title]);

    return (
      <div
        className={cn(
          "group w-full min-w-0 overflow-hidden rounded-md text-sm transition-all",
          isActive
            ? "border border-primary/20 bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
        )}
      >
        {isEditing ? (
          <div className="space-y-2 px-3 py-2">
            <Textarea
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              rows={2}
              disabled={isRenaming}
              className="min-h-14 resize-none bg-transparent text-xs"
            />
            <div className="flex items-center justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onCancelRename}
                disabled={isRenaming}
                title="Cancel rename"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onSubmitRename(session.id, draftTitle)}
                disabled={isRenaming || !draftTitle.trim()}
                title="Save title"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-2 overflow-hidden px-3 py-2">
            <NavLink
              to={`/opencode/session/${session.id}`}
              className="flex min-w-0 max-w-full items-start gap-2 overflow-hidden"
            >
              {isRunning ? (
                <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <MessagesSquare className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-xs text-foreground">
                  {session.title || "Untitled"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {formatRelativeTime(session.time.updated)}
                </div>
              </div>
            </NavLink>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-6 w-6 shrink-0 transition-[opacity,color,background-color]",
                "bg-background/30 text-foreground/70 opacity-0",
                "group-hover:opacity-100 hover:bg-accent hover:text-foreground",
                "focus-visible:opacity-100"
              )}
              onClick={() => onBeginRename(session)}
              title="Rename session"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    );
  }
);

SessionNavItem.displayName = "SessionNavItem";

const OpenCodeLayout = ({ loaderData }: Route.ComponentProps) => {
  const params = useParams();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>(loaderData.sessions ?? []);
  const [isFetching, setIsFetching] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const setCurrentSessionId = useChatStore((state) => state.setCurrentSessionId);
  const sessionStates = useChatStore((state) => state.sessionStates);
  const setServerSessionState = useChatStore((state) => state.setServerSessionState);
  const replaceServerSessionStates = useChatStore((state) => state.replaceServerSessionStates);
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    void fetchSessionStatuses()
      .then((statuses) => {
        replaceServerSessionStates(statuses);
      })
      .catch(() => undefined);

    const source = new EventSource("/api/event-stream");
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data as string) as { payload?: EventPayload } | EventPayload;
      const actual = ("payload" in payload ? payload.payload : payload) as EventPayload;
      if (!actual?.type) return;

      if (actual.type === "session.status") {
        const eventSessionId = actual.properties.sessionID;
        const nextStatus = coerceSessionStatus(actual.properties.status?.type);
        if (eventSessionId && nextStatus) {
          setServerSessionState(eventSessionId, nextStatus);
        }
      }

      if (actual.type === "session.idle") {
        const eventSessionId = actual.properties.sessionID;
        if (eventSessionId) {
          setServerSessionState(eventSessionId, "idle");
          loadSessions();
        }
      }
    };
    source.onerror = () => {
      source.close();
    };
    return () => {
      source.close();
    };
  }, [loadSessions, replaceServerSessionStates, setServerSessionState]);

  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const hasBusy = Object.values(sessionStates).some((status) => isSessionStatusActive(status));

    if (hasBusy && !pollingIntervalRef.current) {
      pollingIntervalRef.current = setInterval(async () => {
        try {
          const statuses = await fetchSessionStatuses();
          replaceServerSessionStates(statuses);
        } catch (_) {
          void _;
        }
      }, 3000);
    }

    if (!hasBusy && pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [replaceServerSessionStates, sessionStates]);

  const beginRename = useCallback((session: Session) => {
    setEditingSessionId(session.id);
  }, []);

  const cancelRename = useCallback(() => {
    setEditingSessionId(null);
  }, []);

  const submitRename = useCallback(async (sessionId: string, nextTitle: string) => {
    const title = nextTitle.trim();
    if (!title) {
      toast.error("Session title cannot be empty");
      return;
    }

    setIsRenaming(true);
    try {
      const response = await fetch(`/api/session/${sessionId}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      if (!response.ok) {
        throw new Error("Failed to rename session");
      }

      setSessions((current) =>
        current.map((session) => (session.id === sessionId ? { ...session, title } : session))
      );
      setEditingSessionId(null);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("sessions:refresh"));
      }
    } catch {
      toast.error("Unable to rename session", {
        description: "OpenCode server not available",
      });
    } finally {
      setIsRenaming(false);
    }
  }, []);

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full min-h-50 min-w-0 overflow-hidden"
    >
      <ResizablePanel defaultSize={30}>
        <aside className="flex h-full min-w-0 flex-col overflow-hidden border-border/50 border-r bg-background">
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
          <ScrollArea className="min-h-0 w-full min-w-0 flex-1 px-2 py-2">
            <nav className="w-full min-w-0 space-y-1">
              {sortedSessions.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
                  No sessions yet. Create one to get started.
                </div>
              ) : (
                sortedSessions.map((session) => {
                  const isActive = session.id === activeSessionId;
                  const isRunning = (sessionStates[session.id] ?? "idle") !== "idle";
                  const isEditing = editingSessionId === session.id;
                  return (
                    <SessionNavItem
                      key={session.id}
                      session={session}
                      isActive={isActive}
                      isRunning={isRunning}
                      isEditing={isEditing}
                      isRenaming={isRenaming}
                      onBeginRename={beginRename}
                      onCancelRename={cancelRename}
                      onSubmitRename={submitRename}
                    />
                  );
                })
              )}
            </nav>
          </ScrollArea>
        </aside>
      </ResizablePanel>

      <ResizablePanel defaultSize={70}>
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <Outlet context={{ sessions } satisfies OpenCodeOutletContext} />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
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

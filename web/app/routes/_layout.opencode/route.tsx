import { Archive, Check, Ellipsis, History, LoaderCircle, MessagesSquare, Pencil, Plus, RefreshCw, RotateCcw, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  coerceSessionStatus,
  fetchSessionStatuses,
  isSessionStatusActive,
  type SessionStatus,
} from "@/lib/session-status";
import { NEW_OPENCODE_SESSION_DRAFT_KEY } from "@/lib/opencode-session";
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
  archivedAt: string | null;
  executionContext: {
    executionProjectId: string;
    contextProjectIds: string[];
    updatedAt: string | null;
  };
  executionSummary: string;
  managedSession: {
    missionId: string;
    missionTitle: string;
    ownerAgent: string;
    ownerLabel: string;
  } | null;
  time: {
    created: number;
    updated: number;
  };
  directory: string;
};

type BulkSessionAction = "archive" | "restore";

type BulkSessionDialogState = {
  action: BulkSessionAction;
  count: number;
  skipped: number;
} | null;

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
  isArchivedView: boolean;
  isArchiveDisabled: boolean;
  isArchivePending: boolean;
  isRunning: boolean;
  isEditing: boolean;
  isRenaming: boolean;
  onArchiveAction: (session: Session, action: "archive" | "restore") => void;
  onBeginRename: (session: Session) => void;
  onCancelRename: () => void;
  onSubmitRename: (sessionId: string, title: string) => void;
};

const SessionNavItem = memo(
  ({
    session,
    isActive,
    isArchivedView,
    isArchiveDisabled,
    isArchivePending,
    isRunning,
    isEditing,
    isRenaming,
    onArchiveAction,
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
          "group relative w-full min-w-0 max-w-full overflow-hidden rounded-xl border p-3 text-sm transition-colors",
          isActive
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border/50 bg-card/40 text-muted-foreground hover:bg-card/70 hover:text-foreground"
        )}
      >
        {isEditing ? (
          <div className="space-y-2">
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
          <>
            <NavLink
              to={`/opencode/session/${session.id}`}
              aria-label={`Open session ${session.title || "Untitled"}`}
              className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
            />
            <div className="grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-2 overflow-hidden">
              <div className="pointer-events-none flex min-w-0 max-w-full items-start gap-2 overflow-hidden">
                {isRunning ? (
                  <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <MessagesSquare className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-xs text-foreground">
                    {session.title || "Untitled"}
                  </div>
                  {session.managedSession ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-primary/90">
                        Managed by {session.managedSession.ownerLabel}
                      </span>
                      <span className="truncate">{session.executionSummary}</span>
                    </div>
                  ) : null}
                  <div className="text-[10px] text-muted-foreground">
                    {isArchivedView && session.archivedAt
                      ? `Archived ${formatRelativeTime(new Date(session.archivedAt).getTime())}`
                      : formatRelativeTime(session.time.updated)}
                  </div>
                </div>
              </div>
              <div className="relative z-10 flex items-center gap-1">
                {!isArchivedView && !session.managedSession ? (
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
                ) : null}
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
                  onClick={() => onArchiveAction(session, isArchivedView ? "restore" : "archive")}
                  disabled={isArchivePending || isArchiveDisabled}
                  title={
                    isArchivedView
                      ? "Restore session"
                      : isArchiveDisabled
                        ? "Running sessions cannot be archived"
                        : "Archive session"
                  }
                >
                  {isArchivedView ? <RotateCcw className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          </>
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
  const [sessionView, setSessionView] = useState<"active" | "archived">(
    params.id && (loaderData.sessions ?? []).some((session) => session.id === params.id && session.archivedAt)
      ? "archived"
      : "active"
  );
  const [isFetching, setIsFetching] = useState(false);
  const [archiveSessionId, setArchiveSessionId] = useState<string | null>(null);
  const [bulkSessionDialog, setBulkSessionDialog] = useState<BulkSessionDialogState>(null);
  const [isBulkSessionActionPending, setIsBulkSessionActionPending] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const clearSessionDraft = useChatStore((state) => state.clearSessionDraft);
  const setCurrentSessionId = useChatStore((state) => state.setCurrentSessionId);
  const sessionStates = useChatStore((state) => state.sessionStates);
  const setServerSessionState = useChatStore((state) => state.setServerSessionState);
  const replaceServerSessionStates = useChatStore((state) => state.replaceServerSessionStates);
  const activeSessionId = params.id;

  const loadSessions = useCallback(async () => {
    setIsFetching(true);
    try {
      const response = await fetch("/api/sessions?view=all");
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

  const handleNewSession = useCallback(() => {
    clearSessionDraft(NEW_OPENCODE_SESSION_DRAFT_KEY);
    navigate("/opencode");
  }, [clearSessionDraft, navigate]);

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => b.time.updated - a.time.updated);
  }, [sessions]);

  const sessionCounts = useMemo(() => {
    return sessions.reduce(
      (counts, session) => {
        if (session.archivedAt) {
          counts.archived += 1;
        } else {
          counts.active += 1;
        }
        return counts;
      },
      { active: 0, archived: 0 }
    );
  }, [sessions]);

  const visibleSessions = useMemo(
    () => sortedSessions.filter((session) => (sessionView === "archived" ? Boolean(session.archivedAt) : !session.archivedAt)),
    [sessionView, sortedSessions]
  );

  const actionableVisibleSessions = useMemo(
    () =>
      visibleSessions.filter((session) => {
        if (sessionView === "archived") {
          return true;
        }

        return session.managedSession !== null || !isSessionStatusActive(sessionStates[session.id] ?? "idle");
      }),
    [sessionStates, sessionView, visibleSessions]
  );

  const skippedVisibleSessionCount = visibleSessions.length - actionableVisibleSessions.length;
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

  const submitArchive = useCallback(
    async (
      session: Session,
      action: "archive" | "restore",
      options?: { showUndo?: boolean; silent?: boolean }
    ) => {
      setArchiveSessionId(session.id);
      try {
        const response = await fetch(`/api/session/${session.id}/archive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });

        if (!response.ok) {
          throw new Error("Failed to update session archive state");
        }

        const data = (await response.json()) as { session?: { id: string; archivedAt: string | null } };
        const updatedSession = data.session;
        if (!updatedSession) {
          throw new Error("Missing session in response");
        }

        setSessions((current) =>
          current.map((entry) =>
            entry.id === session.id ? { ...entry, archivedAt: updatedSession.archivedAt } : entry
          )
        );
        setEditingSessionId(null);

        if (action === "archive" && activeSessionId === session.id) {
          navigate("/opencode", { replace: true });
        }

        if (!options?.silent) {
          toast.success(action === "archive" ? "Session archived" : "Session restored", {
            action:
              options?.showUndo === false
                ? undefined
                : {
                    label: "Undo",
                    onClick: () => {
                      void submitArchive(
                        { ...session, archivedAt: updatedSession.archivedAt },
                        action === "archive" ? "restore" : "archive",
                        { showUndo: false }
                      );
                    },
                  },
          });
        }
        return true;
      } catch {
        if (!options?.silent) {
          toast.error(action === "archive" ? "Unable to archive session" : "Unable to restore session", {
            description: "OpenCode server not available",
          });
        }
        return false;
      } finally {
        setArchiveSessionId(null);
      }
    },
    [activeSessionId, navigate]
  );

  const openBulkSessionDialog = useCallback((action: BulkSessionAction) => {
    setBulkSessionDialog({
      action,
      count: actionableVisibleSessions.length,
      skipped: skippedVisibleSessionCount,
    });
  }, [actionableVisibleSessions.length, skippedVisibleSessionCount]);

  const confirmBulkSessionAction = useCallback(async () => {
    if (!bulkSessionDialog) {
      return;
    }

    const targets = [...actionableVisibleSessions];
    setIsBulkSessionActionPending(true);
    setBulkSessionDialog(null);

    let successCount = 0;
    let failureCount = 0;
    for (const session of targets) {
      const ok = await submitArchive(session, bulkSessionDialog.action, {
        showUndo: false,
        silent: true,
      });
      if (ok) {
        successCount += 1;
      } else {
        failureCount += 1;
      }
    }

    setIsBulkSessionActionPending(false);

    if (successCount === 0 && failureCount > 0) {
      toast.error(
        bulkSessionDialog.action === "archive"
          ? "Unable to archive visible sessions"
          : "Unable to restore visible sessions",
        {
          description: "No sessions were updated.",
        }
      );
      return;
    }

    const verb = bulkSessionDialog.action === "archive" ? "Archived" : "Restored";
    const details = [
      `${verb} ${successCount} ${successCount === 1 ? "session" : "sessions"}.`,
      bulkSessionDialog.skipped > 0
        ? `Skipped ${bulkSessionDialog.skipped} running ${bulkSessionDialog.skipped === 1 ? "session" : "sessions"}.`
        : null,
      failureCount > 0
        ? `${failureCount} ${failureCount === 1 ? "update" : "updates"} failed.`
        : null,
    ]
      .filter(Boolean)
      .join(" ");

    toast.success(
      bulkSessionDialog.action === "archive" ? "Visible sessions archived" : "Visible sessions restored",
      {
        description: details,
      }
    );
  }, [actionableVisibleSessions, bulkSessionDialog, submitArchive]);

  return (
    <>
      <ResizablePanelGroup
        orientation="horizontal"
        className="h-full min-h-50 min-w-0 overflow-hidden"
      >
        <ResizablePanel defaultSize={35}>
          <aside className="flex h-full min-w-0 flex-col overflow-hidden border-border/50 border-r bg-background/30 backdrop-blur-sm">
            <div className="w-full border-border/50 border-b p-3">
              <div className="mb-3 flex w-full items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-primary/80" />
                  <div>
                    <h2 className="font-semibold text-sm">Session History</h2>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
                      Resume by session
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={loadSessions}
                    disabled={isFetching}
                    title="Refresh sessions"
                  >
                    <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={isBulkSessionActionPending || actionableVisibleSessions.length === 0}
                        title={sessionView === "archived" ? "More restore actions" : "More archive actions"}
                      >
                        <Ellipsis className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onSelect={() => openBulkSessionDialog(sessionView === "archived" ? "restore" : "archive")}>
                        {sessionView === "archived"
                          ? `Restore all visible (${actionableVisibleSessions.length})`
                          : `Archive all visible (${actionableVisibleSessions.length})`}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <Button
                className="w-full justify-start gap-2"
                type="button"
                variant={activeSessionId ? "outline" : "default"}
                onClick={handleNewSession}
                disabled={isFetching}
              >
                <Plus className="h-4 w-4" />
                New Session
              </Button>
              <Tabs
                value={sessionView}
                onValueChange={(value) => {
                  setEditingSessionId(null);
                  setSessionView(value === "archived" ? "archived" : "active");
                }}
              >
                <TabsList className="mt-3 grid h-auto w-full grid-cols-2 gap-1 rounded-lg bg-background/40 p-1">
                  <TabsTrigger
                    className="rounded-md px-2 py-1.5 text-[11px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    value="active"
                  >
                    Active ({sessionCounts.active})
                  </TabsTrigger>
                  <TabsTrigger
                    className="rounded-md px-2 py-1.5 text-[11px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    value="archived"
                  >
                    Archived ({sessionCounts.archived})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <ScrollArea
              className="min-h-0 w-full min-w-0 flex-1"
              viewportClassName="[&>div]:!block [&>div]:!w-full"
            >
              <nav className="w-full min-w-0 max-w-full space-y-2 overflow-x-hidden p-3 pr-4">
                {visibleSessions.length === 0 ? (
                  <div className="rounded-lg border border-border/50 bg-card/40 p-3 font-mono text-[11px] text-muted-foreground/70">
                    {sessionView === "archived"
                      ? "No archived sessions."
                      : "No sessions yet. Start a conversation to create one."}
                  </div>
                ) : (
                  visibleSessions.map((session) => {
                    const isActive = session.id === activeSessionId;
                    const isRunning = (sessionStates[session.id] ?? "idle") !== "idle";
                    const isEditing = editingSessionId === session.id;
                    return (
                      <SessionNavItem
                        key={session.id}
                        session={session}
                        isActive={isActive}
                        isArchivedView={sessionView === "archived"}
                        isArchiveDisabled={
                          isBulkSessionActionPending ||
                          (sessionView === "active" && isRunning && session.managedSession === null)
                        }
                        isArchivePending={archiveSessionId === session.id || isBulkSessionActionPending}
                        isRunning={isRunning}
                        isEditing={isEditing}
                        isRenaming={isRenaming}
                        onArchiveAction={submitArchive}
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

        <ResizablePanel defaultSize={65}>
          <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            <Outlet context={{ sessions } satisfies OpenCodeOutletContext} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      <Dialog open={bulkSessionDialog !== null} onOpenChange={(open) => (!open ? setBulkSessionDialog(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkSessionDialog?.action === "archive"
                ? "Archive visible sessions?"
                : "Restore visible sessions?"}
            </DialogTitle>
            <DialogDescription>
              {bulkSessionDialog?.action === "archive"
                ? `${bulkSessionDialog?.count ?? 0} visible sessions will be archived.`
                : `${bulkSessionDialog?.count ?? 0} visible sessions will be restored.`}
              {bulkSessionDialog && bulkSessionDialog.skipped > 0
                ? ` ${bulkSessionDialog.skipped} running ${bulkSessionDialog.skipped === 1 ? "session" : "sessions"} will be skipped.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkSessionDialog(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void confirmBulkSessionAction()}>
              {bulkSessionDialog?.action === "archive" ? "Archive visible" : "Restore visible"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const loader = async ({ request }: Route.LoaderArgs) => {
  try {
    const url = new URL(request.url);
    const response = await fetch(`${url.origin}/api/sessions?view=all`);
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

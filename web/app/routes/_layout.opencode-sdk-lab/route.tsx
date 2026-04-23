import {
  AlertCircle,
  Gauge,
  LoaderCircle,
  Play,
  Radio,
  RefreshCcw,
  Square,
  TerminalSquare,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type SnapshotPayload = {
  defaultDirectory: string;
  logPath: string;
  recentLogs: unknown[];
  serverError: string | null;
  serverUrl: string | null;
};

type EventEntry = {
  id: string;
  receivedAt: string;
  value: unknown;
};

type MissionPayloadResponse = {
  agent: string;
  missionId: string;
  modelRef: string | null;
  payloadParts: Array<{ text: string; type: "text" }>;
  payloadText: string;
  sessionId: string;
  variant: string | null;
};

type ComparisonSessionState = {
  currentSessionId: string;
  missionId: string;
  recreatedSessionId: string;
  recreatedTitle: string;
};

type PendingAction =
  | "abort"
  | "compare"
  | "create"
  | "messages"
  | "mission-payload"
  | "prompt"
  | "snapshot"
  | null;

const INITIAL_SNAPSHOT: SnapshotPayload = {
  defaultDirectory: "",
  logPath: "",
  recentLogs: [],
  serverError: null,
  serverUrl: null,
};

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function getObjectString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : null;
}

function appendBoundedEvent(current: EventEntry[], next: EventEntry): EventEntry[] {
  const limit = 120;
  if (current.length >= limit) {
    return [...current.slice(current.length - limit + 1), next];
  }

  return [...current, next];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const OpencodeSdkLabPage = () => {
  const [snapshot, setSnapshot] = useState<SnapshotPayload>(INITIAL_SNAPSHOT);
  const [pendingAction, setPendingAction] = useState<PendingAction>("snapshot");
  const [missionId, setMissionId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [title, setTitle] = useState("OpenCode SDK Lab");
  const [promptText, setPromptText] = useState("continue");
  const [agent, setAgent] = useState("noctis");
  const [modelRef, setModelRef] = useState("github-copilot/gpt-5-mini");
  const [variant, setVariant] = useState("high");
  const [lastResponse, setLastResponse] = useState("{}");
  const [messagesJson, setMessagesJson] = useState("[]");
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [comparisonSessions, setComparisonSessions] = useState<ComparisonSessionState | null>(null);

  const refreshSnapshot = useCallback(async () => {
    setPendingAction((current) => current ?? "snapshot");

    try {
      const response = await fetch("/api/opencode-sdk-lab");
      const data = (await response.json()) as SnapshotPayload;

      if (!response.ok) {
        throw new Error("Unable to load SDK lab snapshot");
      }

      setSnapshot(data);
    } catch (error) {
      toast.error("Unable to load SDK lab snapshot", {
        description: getErrorMessage(error),
      });
    } finally {
      setPendingAction((current) => (current === "snapshot" ? null : current));
    }
  }, []);

  const performRequest = useCallback(async (path: string, payload: Record<string, unknown>) => {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const rawData = (await response.json().catch(() => null)) as unknown;
    const data = rawData && typeof rawData === "object" ? (rawData as Record<string, unknown>) : {};
    if (!response.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : `SDK lab request failed: ${response.status}`
      );
    }

    setLastResponse(formatJson(data));
    return data;
  }, []);

  const performAction = useCallback(
    async (payload: Record<string, unknown>) => performRequest("/api/opencode-sdk-lab", payload),
    [performRequest]
  );

  const requestMissionPayload = useCallback(async (): Promise<MissionPayloadResponse> => {
    if (!missionId.trim()) {
      throw new Error("Enter a mission ID first");
    }

    const response = (await performRequest("/api/opencode-sdk-lab/noctis-mission-payload", {
      missionId,
      parts: [{ type: "text", text: promptText }],
      ...(sessionId.trim() ? { sessionId: sessionId.trim() } : {}),
    })) as MissionPayloadResponse;

    return response;
  }, [missionId, performRequest, promptText, sessionId]);

  const refreshMessages = useCallback(
    async (targetSessionId?: string) => {
      const nextSessionId = targetSessionId ?? sessionId;
      if (!nextSessionId) {
        return;
      }

      setPendingAction("messages");
      try {
        const data = await performAction({
          action: "messages",
          sessionId: nextSessionId,
        });
        setMessagesJson(formatJson(data.messages ?? []));
      } catch (error) {
        toast.error("Unable to load raw messages", {
          description: getErrorMessage(error),
        });
      } finally {
        setPendingAction(null);
      }
    },
    [performAction, sessionId]
  );

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const source = new EventSource(`/api/opencode-sdk-lab/session/${sessionId}/events`);

    source.onmessage = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data as string);
      } catch {
        parsed = event.data;
      }

      setEvents((current) =>
        appendBoundedEvent(current, {
          id: crypto.randomUUID(),
          receivedAt: new Date().toISOString(),
          value: parsed,
        })
      );

      const type =
        parsed &&
        typeof parsed === "object" &&
        typeof (parsed as { type?: unknown }).type === "string"
          ? (parsed as { type: string }).type
          : null;

      if (type === "session.idle" || type === "session.error") {
        void refreshMessages(sessionId);
        void refreshSnapshot();
      }
    };

    source.onerror = () => {
      setEvents((current) =>
        appendBoundedEvent(current, {
          id: crypto.randomUUID(),
          receivedAt: new Date().toISOString(),
          value: {
            type: "sse.error",
            properties: { message: "Event stream disconnected" },
          },
        })
      );
    };

    return () => {
      source.close();
    };
  }, [refreshMessages, refreshSnapshot, sessionId]);

  const handleCreate = useCallback(async () => {
    setPendingAction("create");

    try {
      const data = await performAction({
        action: "create",
        title,
      });

      const nextSessionId = getObjectString(data.session, "id") ?? "";
      setSessionId(nextSessionId);
      setMessagesJson("[]");
      setEvents([]);
      if (nextSessionId) {
        await refreshMessages(nextSessionId);
      }
      await refreshSnapshot();
    } catch (error) {
      toast.error("Unable to create raw SDK session", {
        description: getErrorMessage(error),
      });
    } finally {
      setPendingAction(null);
    }
  }, [performAction, refreshMessages, refreshSnapshot, title]);

  const handleLoadMissionPayload = useCallback(async () => {
    setPendingAction("mission-payload");

    try {
      const payload = await requestMissionPayload();
      setLastResponse(formatJson(payload));
      if (!sessionId && payload.sessionId) {
        setSessionId(payload.sessionId);
      }
    } catch (error) {
      toast.error("Unable to build mission payload", {
        description: getErrorMessage(error),
      });
    } finally {
      setPendingAction(null);
    }
  }, [requestMissionPayload, sessionId]);

  const handlePrompt = useCallback(async () => {
    if (!sessionId) {
      toast.error("Create a session first");
      return;
    }

    setPendingAction("prompt");

    try {
      await performAction({
        action: "prompt",
        agent,
        modelRef,
        sessionId,
        text: promptText,
        variant,
      });
      await refreshSnapshot();
      await refreshMessages(sessionId);
    } catch (error) {
      toast.error("Unable to send raw SDK prompt", {
        description: getErrorMessage(error),
      });
    } finally {
      setPendingAction(null);
    }
  }, [
    agent,
    modelRef,
    performAction,
    promptText,
    refreshMessages,
    refreshSnapshot,
    sessionId,
    variant,
  ]);

  const handleAbort = useCallback(async () => {
    if (!sessionId) {
      toast.error("Create a session first");
      return;
    }

    setPendingAction("abort");

    try {
      await performAction({
        action: "abort",
        sessionId,
      });
      await refreshSnapshot();
      await refreshMessages(sessionId);
    } catch (error) {
      toast.error("Unable to abort raw SDK session", {
        description: getErrorMessage(error),
      });
    } finally {
      setPendingAction(null);
    }
  }, [performAction, refreshMessages, refreshSnapshot, sessionId]);

  const handleCompareCurrentVsRecreated = useCallback(async () => {
    setPendingAction("compare");

    try {
      const payload = await requestMissionPayload();
      const currentSessionId = sessionId.trim() || payload.sessionId;
      if (!currentSessionId) {
        throw new Error("Managed session ID is missing");
      }

      const currentPrompt = await performAction({
        action: "prompt",
        agent: payload.agent,
        ...(payload.modelRef ? { modelRef: payload.modelRef } : {}),
        parts: payload.payloadParts,
        sessionId: currentSessionId,
        ...(payload.variant ? { variant: payload.variant } : {}),
      });

      const recreatedTitle = `mission:${payload.missionId}:recreated-compare`;
      const recreatedSession = await performAction({
        action: "create",
        title: recreatedTitle,
      });
      const recreatedSessionId = getObjectString(recreatedSession.session, "id") ?? "";
      if (!recreatedSessionId) {
        throw new Error("Recreated session returned no ID");
      }

      const recreatedPrompt = await performAction({
        action: "prompt",
        agent: payload.agent,
        ...(payload.modelRef ? { modelRef: payload.modelRef } : {}),
        parts: payload.payloadParts,
        sessionId: recreatedSessionId,
        ...(payload.variant ? { variant: payload.variant } : {}),
      });

      setComparisonSessions({
        currentSessionId,
        missionId: payload.missionId,
        recreatedSessionId,
        recreatedTitle,
      });
      setLastResponse(
        formatJson({
          action: "compare-current-vs-recreated",
          current: {
            promptResult: currentPrompt,
            sessionId: currentSessionId,
          },
          missionId: payload.missionId,
          payload: {
            partCount: payload.payloadParts.length,
            payloadTextLength: payload.payloadText.length,
            previewSessionId: payload.sessionId,
          },
          recreated: {
            promptResult: recreatedPrompt,
            sessionId: recreatedSessionId,
            title: recreatedTitle,
          },
        })
      );

      await refreshSnapshot();
      toast.success("Dispatched the same mission payload to current and recreated sessions");
    } catch (error) {
      toast.error("Unable to compare current vs recreated sessions", {
        description: getErrorMessage(error),
      });
    } finally {
      setPendingAction(null);
    }
  }, [performAction, refreshSnapshot, requestMissionPayload, sessionId]);

  const handleClearLocalState = useCallback(() => {
    setComparisonSessions(null);
    setSessionId("");
    setMessagesJson("[]");
    setEvents([]);
    setLastResponse("{}");
  }, []);

  const isBusy = pendingAction !== null;

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-linear-to-br from-slate-950 via-slate-900 to-cyan-950/45">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col overflow-hidden px-4 py-6 md:px-6 md:py-8">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-cyan-200/15 bg-black/25 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm">
          <div className="border-b border-cyan-100/10 bg-linear-to-r from-cyan-400/12 via-cyan-200/6 to-transparent px-6 py-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                <Gauge className="h-5 w-5" />
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-50/55">
                  Debug Harness
                </p>
                <h1 className="text-xl text-cyan-50 md:text-2xl">OpenCode SDK Lab</h1>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.85fr)]">
              <div className="space-y-5">
                <div className="rounded-3xl border border-cyan-100/10 bg-cyan-50/3 p-5 text-cyan-50/85">
                  <p className="max-w-3xl text-sm leading-7 text-cyan-50/76">
                    This lab isolates a minimal OpenCode SDK flow from the heavier Noctis and shared
                    session surfaces. It uses raw SDK session create, prompt, abort, message reload,
                    and event observation with a dedicated server-side debug log.
                  </p>
                </div>

                <div className="grid gap-4 lg:h-[min(42rem,calc(100dvh-14rem))] lg:auto-rows-fr lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                  <div className="min-w-0 rounded-3xl border border-cyan-100/10 bg-black/20 p-5 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden">
                    <div className="flex items-center gap-2 text-cyan-50">
                      <TerminalSquare className="h-4 w-4" />
                      <h2 className="text-sm">Raw Session Controls</h2>
                    </div>

                    <div className="space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label
                          className="space-y-2 text-sm text-cyan-50/78"
                          htmlFor="sdk-lab-title"
                        >
                          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-50/45">
                            Session Title
                          </span>
                          <Input
                            id="sdk-lab-title"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                          />
                        </label>

                        <label
                          className="space-y-2 text-sm text-cyan-50/78"
                          htmlFor="sdk-lab-session-id"
                        >
                          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-50/45">
                            Session ID
                          </span>
                          <Input
                            id="sdk-lab-session-id"
                            placeholder="Create a session first"
                            value={sessionId}
                            onChange={(event) => setSessionId(event.target.value)}
                          />
                        </label>

                        <label
                          className="space-y-2 text-sm text-cyan-50/78"
                          htmlFor="sdk-lab-agent"
                        >
                          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-50/45">
                            Agent
                          </span>
                          <Input
                            id="sdk-lab-agent"
                            value={agent}
                            onChange={(event) => setAgent(event.target.value)}
                          />
                        </label>

                        <label
                          className="space-y-2 text-sm text-cyan-50/78"
                          htmlFor="sdk-lab-model-ref"
                        >
                          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-50/45">
                            Model Ref
                          </span>
                          <Input
                            id="sdk-lab-model-ref"
                            placeholder="provider/model"
                            value={modelRef}
                            onChange={(event) => setModelRef(event.target.value)}
                          />
                        </label>

                        <label
                          className="space-y-2 text-sm text-cyan-50/78 md:col-span-2"
                          htmlFor="sdk-lab-variant"
                        >
                          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-50/45">
                            Variant
                          </span>
                          <Input
                            id="sdk-lab-variant"
                            value={variant}
                            onChange={(event) => setVariant(event.target.value)}
                          />
                        </label>

                        <label
                          className="space-y-2 text-sm text-cyan-50/78 md:col-span-2"
                          htmlFor="sdk-lab-mission-id"
                        >
                          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-50/45">
                            Mission ID
                          </span>
                          <Input
                            id="sdk-lab-mission-id"
                            placeholder="Required for Noctis mission replay/compare"
                            value={missionId}
                            onChange={(event) => setMissionId(event.target.value)}
                          />
                        </label>
                      </div>

                      <label
                        className="space-y-3 text-sm text-cyan-50/78"
                        htmlFor="sdk-lab-prompt-text"
                      >
                        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-50/45">
                          Prompt Text
                        </span>
                        <Textarea
                          id="sdk-lab-prompt-text"
                          className="min-h-30 bg-slate-950/70 text-cyan-50"
                          value={promptText}
                          onChange={(event) => setPromptText(event.target.value)}
                        />
                      </label>
                    </div>

                    <div className="mt-4 shrink-0 border-cyan-100/10 border-t pt-4">
                      <div className="flex flex-wrap gap-3">
                        <Button disabled={isBusy} onClick={() => void handleCreate()}>
                          {pendingAction === "create" ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          Create Session
                        </Button>
                        <Button
                          disabled={isBusy || !sessionId}
                          onClick={() => void handlePrompt()}
                          variant="secondary"
                        >
                          {pendingAction === "prompt" ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <TerminalSquare className="h-4 w-4" />
                          )}
                          Send Prompt
                        </Button>
                        <Button
                          disabled={isBusy || !sessionId}
                          onClick={() => void handleAbort()}
                          variant="destructive"
                        >
                          {pendingAction === "abort" ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                          Abort
                        </Button>
                        <Button
                          disabled={isBusy || !missionId.trim()}
                          onClick={() => void handleLoadMissionPayload()}
                          variant="secondary"
                        >
                          {pendingAction === "mission-payload" ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Gauge className="h-4 w-4" />
                          )}
                          Load Mission Payload
                        </Button>
                        <Button
                          disabled={isBusy || !missionId.trim()}
                          onClick={() => void handleCompareCurrentVsRecreated()}
                          variant="outline"
                        >
                          {pendingAction === "compare" ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Radio className="h-4 w-4" />
                          )}
                          Compare Current vs Recreated
                        </Button>
                        <Button
                          disabled={isBusy || !sessionId}
                          onClick={() => void refreshMessages()}
                          variant="outline"
                        >
                          {pendingAction === "messages" ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCcw className="h-4 w-4" />
                          )}
                          Reload Messages
                        </Button>
                        <Button
                          disabled={isBusy}
                          onClick={() => void refreshSnapshot()}
                          variant="ghost"
                        >
                          <RefreshCcw className="h-4 w-4" />
                          Refresh Snapshot
                        </Button>
                        <Button disabled={isBusy} onClick={handleClearLocalState} variant="ghost">
                          Clear Local State
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 rounded-3xl border border-cyan-100/10 bg-black/20 p-5 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden">
                    <div className="flex items-center gap-2 text-cyan-50">
                      <Radio className="h-4 w-4" />
                      <h2 className="text-sm">Connection Snapshot</h2>
                    </div>

                    <div className="space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                      <dl className="space-y-3 text-sm text-cyan-50/78">
                        <div className="rounded-2xl border border-cyan-100/10 bg-white/3 p-3">
                          <dt className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-50/45">
                            Server URL
                          </dt>
                          <dd className="mt-1 break-all text-cyan-50">
                            {snapshot.serverUrl ?? "Unavailable"}
                          </dd>
                        </div>
                        <div className="rounded-2xl border border-cyan-100/10 bg-white/3 p-3">
                          <dt className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-50/45">
                            Default Directory
                          </dt>
                          <dd className="mt-1 break-all text-cyan-50/86">
                            {snapshot.defaultDirectory || "-"}
                          </dd>
                        </div>
                        <div className="rounded-2xl border border-cyan-100/10 bg-white/3 p-3">
                          <dt className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-50/45">
                            Debug Log Path
                          </dt>
                          <dd className="mt-1 break-all text-cyan-50/86">
                            {snapshot.logPath || "-"}
                          </dd>
                        </div>
                      </dl>

                      {snapshot.serverError ? (
                        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm leading-6 text-rose-100">
                          <div className="mb-2 flex items-center gap-2 text-rose-50">
                            <AlertCircle className="h-4 w-4" />
                            <span>Server issue</span>
                          </div>
                          <p>{snapshot.serverError}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-3 rounded-3xl border border-cyan-100/10 bg-black/20 p-5">
                    <div className="flex items-center gap-2 text-cyan-50">
                      <Gauge className="h-4 w-4" />
                      <h2 className="text-sm">Raw Message Snapshot</h2>
                    </div>
                    <pre className="max-h-112 overflow-auto rounded-2xl border border-cyan-100/10 bg-slate-950/70 p-4 text-xs leading-6 text-cyan-50/82">
                      {messagesJson}
                    </pre>
                  </div>

                  <div className="space-y-3 rounded-3xl border border-cyan-100/10 bg-black/20 p-5">
                    <div className="flex items-center gap-2 text-cyan-50">
                      <Radio className="h-4 w-4" />
                      <h2 className="text-sm">Live Event Trace</h2>
                    </div>
                    <div className="max-h-112 overflow-auto rounded-2xl border border-cyan-100/10 bg-slate-950/70 p-4 text-xs leading-6 text-cyan-50/82">
                      {events.length === 0 ? (
                        <p className="text-cyan-50/52">
                          Select or create a session to start streaming events.
                        </p>
                      ) : (
                        events.map((entry) => (
                          <div
                            key={entry.id}
                            className="mb-3 border-b border-cyan-100/10 pb-3 last:mb-0 last:border-b-0 last:pb-0"
                          >
                            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-50/45">
                              {entry.receivedAt}
                            </p>
                            <pre className="whitespace-pre-wrap break-all">
                              {formatJson(entry.value)}
                            </pre>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {comparisonSessions ? (
                  <div className="space-y-3 rounded-3xl border border-cyan-100/10 bg-black/20 p-5">
                    <div className="flex items-center gap-2 text-cyan-50">
                      <Radio className="h-4 w-4" />
                      <h2 className="text-sm">Current vs Recreated Sessions</h2>
                    </div>
                    <dl className="grid gap-3 md:grid-cols-3 text-sm text-cyan-50/78">
                      <div className="rounded-2xl border border-cyan-100/10 bg-white/3 p-3">
                        <dt className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-50/45">
                          Mission ID
                        </dt>
                        <dd className="mt-1 break-all text-cyan-50">{comparisonSessions.missionId}</dd>
                      </div>
                      <div className="rounded-2xl border border-cyan-100/10 bg-white/3 p-3">
                        <dt className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-50/45">
                          Current Session
                        </dt>
                        <dd className="mt-1 break-all text-cyan-50">{comparisonSessions.currentSessionId}</dd>
                      </div>
                      <div className="rounded-2xl border border-cyan-100/10 bg-white/3 p-3">
                        <dt className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-50/45">
                          Recreated Session
                        </dt>
                        <dd className="mt-1 break-all text-cyan-50">
                          {comparisonSessions.recreatedSessionId}
                        </dd>
                      </div>
                    </dl>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        disabled={isBusy}
                        onClick={() => {
                          setSessionId(comparisonSessions.currentSessionId);
                          setEvents([]);
                          void refreshMessages(comparisonSessions.currentSessionId);
                        }}
                        variant="secondary"
                      >
                        Inspect Current Session
                      </Button>
                      <Button
                        disabled={isBusy}
                        onClick={() => {
                          setSessionId(comparisonSessions.recreatedSessionId);
                          setEvents([]);
                          void refreshMessages(comparisonSessions.recreatedSessionId);
                        }}
                        variant="outline"
                      >
                        Inspect Recreated Session
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              <aside className="space-y-4 rounded-[28px] border border-cyan-100/10 bg-black/20 p-5 text-cyan-50/82">
                <h2 className="text-sm text-cyan-50">Suggested Checks</h2>
                <ul className="space-y-2 text-sm leading-6 text-cyan-50/72">
                  <li>Create a session against the current app-managed OpenCode server.</li>
                  <li>Send a plain text prompt, abort mid-run, then send another prompt again.</li>
                  <li>Inspect raw messages and the session event stream side by side.</li>
                  <li>For managed mission debugging, load the composed payload and compare current vs recreated sessions.</li>
                </ul>

                <div className="space-y-3 rounded-3xl border border-cyan-100/10 bg-white/3 p-4">
                  <h3 className="text-sm text-cyan-50">Last Response</h3>
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-2xl bg-slate-950/70 p-3 text-xs leading-6 text-cyan-50/82">
                    {lastResponse}
                  </pre>
                </div>

                <div className="space-y-3 rounded-3xl border border-cyan-100/10 bg-white/3 p-4">
                  <h3 className="text-sm text-cyan-50">Recent Server Logs</h3>
                  <pre className="max-h-112 overflow-auto whitespace-pre-wrap break-all rounded-2xl bg-slate-950/70 p-3 text-xs leading-6 text-cyan-50/82">
                    {snapshot.recentLogs.length > 0 ? formatJson(snapshot.recentLogs) : "[]"}
                  </pre>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default OpencodeSdkLabPage;

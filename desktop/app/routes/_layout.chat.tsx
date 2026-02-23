import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import AgentChatColumn from "@/components/agent-chat-column";
import MessageComposer from "@/components/message-composer";
import StatusBar, {
  type AgentStatus,
  computeStatus,
} from "@/components/status-bar";
import { type MainAgentId, useAgentChatLog } from "@/lib/use-agent-chat-log";
import { COMRADES, type ComradeId } from "@/lib/use-comrade-status";
import { type InboxLogRecord, useInboxLog } from "@/lib/use-inbox-log";

const AGENTS: MainAgentId[] = ["noctis", "lunafreya"];

export default function UnifiedChatRoute() {
  const { getRecordsForAgent, lastUpdated, error, isTauri, refresh } =
    useAgentChatLog();
  const [activeAgent, setActiveAgent] = useState<MainAgentId>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("chat_active_agent");
      if (saved === "noctis" || saved === "lunafreya") {
        return saved;
      }
    }
    return "noctis";
  });

  useEffect(() => {
    localStorage.setItem("chat_active_agent", activeAgent);
  }, [activeAgent]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (isTauri) {
          const options = await invoke<string[]>("read_model_options");
          if (!cancelled) {
            setModelOptions(options);
          }
        } else {
          const res = await fetch("/api/model-options");
          if (!res.ok) {
            return;
          }
          const data = (await res.json()) as { modelOptions?: string[] };
          if (!cancelled && Array.isArray(data.modelOptions)) {
            setModelOptions(data.modelOptions);
          }
        }
      } catch (_) {
        setModelOptions([]);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isTauri]);

  // Filtered records per agent (memoised to minimise re-renders)
  const noctisRecords = useMemo(
    () => getRecordsForAgent("noctis"),
    [getRecordsForAgent]
  );
  const lunafeyaRecords = useMemo(
    () => getRecordsForAgent("lunafreya"),
    [getRecordsForAgent]
  );

  const recordsMap = useMemo(
    () => ({ noctis: noctisRecords, lunafreya: lunafeyaRecords }),
    [noctisRecords, lunafeyaRecords]
  );

  // Inbox messages (Crystal→agent + agent→agent) from runtime/logs/inbox-log.jsonl
  const { getMessagesForAgent: getInboxMessages } = useInboxLog();

  // Party view: which comrade (or null = Noctis itself) is shown in the Noctis column
  const [noctisPartyView, setNoctisPartyView] = useState<ComradeId | null>(
    () => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("chat_noctis_party_view");
        if (saved) {
          return saved as ComradeId;
        }
      }
      return null;
    }
  );

  useEffect(() => {
    if (noctisPartyView) {
      localStorage.setItem("chat_noctis_party_view", noctisPartyView);
    } else {
      localStorage.removeItem("chat_noctis_party_view");
    }
  }, [noctisPartyView]);

  // Comrade chat records from agent-chat-monitor.jsonl
  const comradeRecords = useMemo(
    () =>
      Object.fromEntries(
        COMRADES.map((c) => [c, getRecordsForAgent(c)])
      ) as Record<ComradeId, ReturnType<typeof getRecordsForAgent>>,
    [getRecordsForAgent]
  );

  // Comrade inbox messages from inbox-log.jsonl
  const comradeInboxMessages = useMemo(
    () =>
      Object.fromEntries(
        COMRADES.map((c) => [c, getInboxMessages(c)])
      ) as Record<ComradeId, ReturnType<typeof getInboxMessages>>,
    [getInboxMessages]
  );

  const [statuses, setStatuses] = useState<Record<string, string>>({});

  const fetchStatuses = useCallback(async () => {
    try {
      const res = await fetch("/api/agent-statuses");
      if (res.ok) {
        const data = await res.json();
        setStatuses(data);
      }
    } catch (e) {
      console.error("Failed to fetch agent statuses:", e);
    }
  }, []);

  // Polling for statuses
  useEffect(() => {
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 2000);
    return () => clearInterval(interval);
  }, [fetchStatuses]);

  // Optimistic "just-sent" timestamp per agent — bridges the polling gap (3 s)
  // until inbox-log.jsonl catches up with the Crystal message.
  const [optimisticSentAt, setOptimisticSentAt] = useState<
    Record<MainAgentId, number | null>
  >({
    noctis: null,
    lunafreya: null,
  });

  // Derive status with optimistic override:
  // After sending a message, force the status to "busy" until the next poll.
  const effectiveStatuses = useMemo(() => {
    const result = { ...statuses };
    for (const agent of AGENTS) {
      const opt = optimisticSentAt[agent];
      if (opt && Date.now() - opt < 8000 && result[agent] !== "busy") {
        // Force busy for 8s or until next real busy poll
        result[agent] = "busy";
      }
    }
    return result;
  }, [statuses, optimisticSentAt]);

  // Optimistic messages sent by Crystal but not yet confirmed by the polling log.
  // Record<AgentId, InboxLogRecord[]>
  const [optimisticMessages, setOptimisticMessages] = useState<
    Record<MainAgentId, InboxLogRecord[]>
  >({
    noctis: [],
    lunafreya: [],
  });

  // Prune optimistic messages once they appear in the real inbox logs.
  useEffect(() => {
    setOptimisticMessages((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const agent of AGENTS) {
        const realIds = new Set(getInboxMessages(agent).map((m) => m.id));
        const filtered = prev[agent].filter((m) => !realIds.has(m.id));
        if (filtered.length !== prev[agent].length) {
          next[agent] = filtered;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [getInboxMessages]);

  const handleCrystalSent = useCallback(
    async (agent: MainAgentId, content: string, id?: string) => {
      // Create optimistic record if we have an ID
      if (id) {
        const optRecord: InboxLogRecord = {
          id,
          ts: new Date().toISOString(),
          from: "crystal",
          to: agent,
          type: "message",
          content,
        };
        setOptimisticMessages((prev) => ({
          ...prev,
          [agent]: [...prev[agent], optRecord],
        }));
      }

      // Optimistic update: show typing indicator immediately before log catches up
      setOptimisticSentAt((prev) => ({ ...prev, [agent]: Date.now() }));
      await refresh();
    },
    [refresh]
  );

  // Derive stale/idle/online status per agent (task 4.3)
  const agentStatuses = useMemo(
    () =>
      AGENTS.map((agent) => {
        const records = recordsMap[agent];
        const lastRecord = records.at(-1);
        const lastResponseAt = lastRecord ? new Date(lastRecord.ts) : null;
        const status: AgentStatus = computeStatus(lastResponseAt);
        return { agent, status, lastResponseAt };
      }),
    [recordsMap]
  );

  // Keyboard shortcuts: Ctrl+1 = Noctis, Ctrl+2 = Lunafreya (task 4.6)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) {
        return;
      }
      if (e.key === "1") {
        e.preventDefault();
        setActiveAgent("noctis");
      } else if (e.key === "2") {
        e.preventDefault();
        setActiveAgent("lunafreya");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
      {/* Status bar */}
      <StatusBar
        agentStatuses={agentStatuses}
        lastUpdated={lastUpdated}
        onRefresh={refresh}
      />

      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-400 text-xs">
          Error: {error}
        </div>
      )}

      {/* 2-column chat area */}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
        {AGENTS.map((agent) => (
          <AgentChatColumn
            agent={agent}
            inboxMessages={getInboxMessages(agent)}
            isActive={activeAgent === agent}
            isTauri={isTauri}
            key={agent}
            modelOptions={modelOptions}
            onActivate={() => setActiveAgent(agent)}
            optimisticMessages={optimisticMessages[agent]}
            records={recordsMap[agent]}
            status={effectiveStatuses[agent]}
            {...(agent === "noctis" && {
              partyView: noctisPartyView,
              onPartyViewChange: setNoctisPartyView,
              partyRecords: comradeRecords,
              partyInboxMessages: comradeInboxMessages,
              busyMap: effectiveStatuses as any,
            })}
          />
        ))}
      </div>

      {/* Message composer */}
      <MessageComposer
        activeAgent={activeAgent}
        isTauri={isTauri}
        onSent={handleCrystalSent}
      />
    </div>
  );
}

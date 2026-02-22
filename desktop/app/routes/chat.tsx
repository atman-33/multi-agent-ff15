import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAgentChatLog, type AgentId, type MainAgentId } from "@/lib/useAgentChatLog";
import { useInboxLog } from "@/lib/useInboxLog";
import { COMRADES, type ComradeId } from "@/lib/useComradeStatus";
import AgentChatColumn from "@/components/AgentChatColumn";
import MessageComposer from "@/components/MessageComposer";
import StatusBar, { computeStatus, type AgentStatus } from "@/components/StatusBar";

const AGENTS: MainAgentId[] = ["noctis", "lunafreya"];

export default function UnifiedChatRoute() {
  const { getRecordsForAgent, lastUpdated, error, isTauri, refresh } =
    useAgentChatLog();
  const [activeAgent, setActiveAgent] = useState<MainAgentId>("noctis");
  const [modelOptions, setModelOptions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (isTauri) {
          const options = await invoke<string[]>("read_model_options");
          if (!cancelled) setModelOptions(options);
        } else {
          const res = await fetch("/api/model-options");
          if (!res.ok) return;
          const data = (await res.json()) as { modelOptions?: string[] };
          if (!cancelled && Array.isArray(data.modelOptions)) setModelOptions(data.modelOptions);
        }
      } catch (_) {
        setModelOptions([]);
      }
    };
    load();
    return () => { cancelled = true; };
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

  const recordsMap = { noctis: noctisRecords, lunafreya: lunafeyaRecords };

  // Inbox messages (Crystal→agent + agent→agent) from runtime/logs/inbox-log.jsonl
  const { getMessagesForAgent: getInboxMessages } = useInboxLog();

  // Party view: which comrade (or null = Noctis itself) is shown in the Noctis column
  const [noctisPartyView, setNoctisPartyView] = useState<ComradeId | null>(null);

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

  // Unified busy state for Comrades: same logic as isWaitingMap (Noctis/Lunafreya).
  // busy = last inbox-log message to agent > last agent-chat-monitor answer from agent.
  const busyMap = useMemo(() => {
    const result = {} as Record<ComradeId, boolean>;
    for (const c of COMRADES) {
      const records = comradeRecords[c];
      const msgs = comradeInboxMessages[c];
      const agentLastAt =
        records.length > 0 ? new Date(records[records.length - 1].ts).getTime() : null;
      const lastInboxAt =
        msgs.length > 0 ? new Date(msgs[msgs.length - 1].ts).getTime() : null;
      result[c] = lastInboxAt !== null && (agentLastAt === null || lastInboxAt > agentLastAt);
    }
    return result;
  }, [comradeRecords, comradeInboxMessages]);

  // Optimistic "just-sent" timestamp per agent — bridges the polling gap (3 s)
  // until inbox-log.jsonl catches up with the Crystal message.
  const [optimisticSentAt, setOptimisticSentAt] = useState<Record<MainAgentId, number | null>>({
    noctis: null,
    lunafreya: null,
  });

  // Derive isWaiting: Crystal's most recent message is newer than Agent's last response.
  // Page-transition-safe because the source of truth is log data, not ephemeral local state.
  const isWaitingMap = useMemo(() => {
    const result: Record<MainAgentId, boolean> = { noctis: false, lunafreya: false };
    for (const agent of AGENTS) {
      const records = recordsMap[agent];
      const msgs = getInboxMessages(agent);

      const agentLastAt =
        records.length > 0 ? new Date(records[records.length - 1].ts).getTime() : null;

      // All incoming messages (Crystal or other agents) trigger busy state
      const lastInboxAt =
        msgs.length > 0
          ? new Date(msgs[msgs.length - 1].ts).getTime()
          : null;

      // Merge log-derived timestamp with optimistic value (whichever is later)
      const optimistic = optimisticSentAt[agent];
      const effectiveSentAt =
        lastInboxAt !== null || optimistic !== null
          ? Math.max(lastInboxAt ?? 0, optimistic ?? 0)
          : null;

      result[agent] =
        effectiveSentAt !== null &&
        (agentLastAt === null || effectiveSentAt > agentLastAt);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noctisRecords, lunafeyaRecords, getInboxMessages, optimisticSentAt]);

  const handleCrystalSent = useCallback(
    async (agent: MainAgentId, _content: string) => {
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
        const lastRecord = records[records.length - 1];
        const lastResponseAt = lastRecord ? new Date(lastRecord.ts) : null;
        const status: AgentStatus = computeStatus(lastResponseAt);
        return { agent, status, lastResponseAt };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [noctisRecords, lunafeyaRecords]
  );

  // Keyboard shortcuts: Ctrl+1 = Noctis, Ctrl+2 = Lunafreya (task 4.6)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
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
    <div className="flex flex-col h-full gap-3 p-4 overflow-hidden">
      {/* Status bar */}
      <StatusBar
        agentStatuses={agentStatuses}
        lastUpdated={lastUpdated}
        onRefresh={refresh}
      />

      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          Error: {error}
        </div>
      )}

      {/* 2-column chat area */}
      <div className="flex-1 grid grid-cols-2 gap-3 min-h-0">
        {AGENTS.map((agent) => (
          <AgentChatColumn
            key={agent}
            agent={agent}
            records={recordsMap[agent]}
            inboxMessages={getInboxMessages(agent)}
            isWaiting={isWaitingMap[agent]}
            isActive={activeAgent === agent}
            onActivate={() => setActiveAgent(agent)}
            modelOptions={modelOptions}
            isTauri={isTauri}
            {...(agent === "noctis" && {
              partyView: noctisPartyView,
              onPartyViewChange: setNoctisPartyView,
              partyRecords: comradeRecords,
              partyInboxMessages: comradeInboxMessages,
              busyMap,
            })}
          />
        ))}
      </div>

      {/* Message composer */}
      <MessageComposer activeAgent={activeAgent} isTauri={isTauri} onSent={handleCrystalSent} />
    </div>
  );
}

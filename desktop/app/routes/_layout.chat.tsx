import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import AgentChatColumn from "@/components/agent-chat-column";
import StatusBar from "@/components/status-bar";
import {
  type AgentId,
  type MainAgentId,
  useAgentChatLog,
} from "@/lib/use-agent-chat-log";
import { useAgentStatuses } from "@/lib/use-agent-statuses";
import { COMRADES, type ComradeId } from "@/lib/use-comrade-status";
import { useContextUsage } from "@/lib/use-context-usage";
import { type InboxLogRecord, useInboxLog } from "@/lib/use-inbox-log";

const AGENTS: MainAgentId[] = ["noctis", "lunafreya"];

export default function UnifiedChatRoute() {
  const {
    getRecordsForAgent,
    lastUpdated,
    error,
    isTauri,
    refresh: refreshChat,
  } = useAgentChatLog();
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

  const { getMessagesForAgent: getInboxMessages, refresh: refreshInbox } =
    useInboxLog();

  const handleRefresh = useCallback(async () => {
    await Promise.all([refreshChat(), refreshInbox()]);
  }, [refreshChat, refreshInbox]);

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

  const comradeRecords = useMemo(
    () =>
      Object.fromEntries(
        COMRADES.map((c) => [c, getRecordsForAgent(c)])
      ) as Record<ComradeId, ReturnType<typeof getRecordsForAgent>>,
    [getRecordsForAgent]
  );

  const comradeInboxMessages = useMemo(
    () =>
      Object.fromEntries(
        COMRADES.map((c) => [c, getInboxMessages(c)])
      ) as Record<ComradeId, ReturnType<typeof getInboxMessages>>,
    [getInboxMessages]
  );

  const statuses = useAgentStatuses();
  const contextUsage = useContextUsage();

  const [modeSwitchTrigger, setModeSwitchTrigger] = useState(0);

  useEffect(() => {
    const handleModeSwitch = () => {
      setModeSwitchTrigger((prev) => prev + 1);
    };

    window.addEventListener("mode-switched", handleModeSwitch);
    return () => window.removeEventListener("mode-switched", handleModeSwitch);
  }, []);

  const [optimisticSentAt, setOptimisticSentAt] = useState<
    Record<MainAgentId, number | null>
  >({
    noctis: null,
    lunafreya: null,
  });

  const effectiveStatuses = useMemo(() => {
    const result = { ...statuses };
    for (const agent of AGENTS) {
      const opt = optimisticSentAt[agent];
      if (opt && Date.now() - opt < 8000 && result[agent] !== "busy") {
        result[agent] = "busy";
      }
    }
    return result;
  }, [statuses, optimisticSentAt]);

  const [optimisticMessages, setOptimisticMessages] = useState<
    Record<MainAgentId, InboxLogRecord[]>
  >({
    noctis: [],
    lunafreya: [],
  });

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
    async (agent: AgentId, content: string, id?: string) => {
      if (id && (agent === "noctis" || agent === "lunafreya")) {
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

      if (agent === "noctis" || agent === "lunafreya") {
        setOptimisticSentAt((prev) => ({ ...prev, [agent]: Date.now() }));
      }
      await handleRefresh();
    },
    [handleRefresh]
  );

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
      <StatusBar
        contextUsage={contextUsage}
        lastUpdated={lastUpdated}
        onRefresh={handleRefresh}
      />

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-400 text-xs">
          Error: {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
        {AGENTS.map((agent) => {
          const effectiveContextAgent =
            agent === "noctis" && noctisPartyView ? noctisPartyView : agent;
          return (
            <AgentChatColumn
              agent={agent}
              contextPercent={contextUsage[effectiveContextAgent] ?? null}
              inboxMessages={getInboxMessages(agent)}
              isTauri={isTauri}
              key={agent}
              modelOptions={modelOptions}
              modeSwitchTrigger={modeSwitchTrigger}
              onSent={handleCrystalSent}
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
          );
        })}
      </div>
    </div>
  );
}

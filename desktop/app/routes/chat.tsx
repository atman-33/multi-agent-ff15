import { useState, useEffect, useMemo } from "react";
import { useAgentChatLog, type AgentId } from "@/lib/useAgentChatLog";
import AgentChatColumn from "@/components/AgentChatColumn";
import MessageComposer from "@/components/MessageComposer";
import StatusBar, { computeStatus, type AgentStatus } from "@/components/StatusBar";

const AGENTS: AgentId[] = ["noctis", "lunafreya"];

export default function UnifiedChatRoute() {
  const { getRecordsForAgent, lastUpdated, error, isTauri, refresh } =
    useAgentChatLog();
  const [activeAgent, setActiveAgent] = useState<AgentId>("noctis");

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
            isActive={activeAgent === agent}
            onActivate={() => setActiveAgent(agent)}
          />
        ))}
      </div>

      {/* Message composer */}
      <MessageComposer activeAgent={activeAgent} isTauri={isTauri} />
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AgentId } from "@/lib/useAgentChatLog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrystalMessageRecord {
  id: string;
  ts: string;
  agent: AgentId;
  content: string;
  /** Number of agent records in the log at the moment Crystal sent this message. */
  recordIndexAtSend: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useCrystalMessages
 *
 * Persists Crystal (user) sent messages to runtime/logs/crystal-messages.jsonl
 * so they survive browser refreshes.
 *
 * - Initial load: reads all persisted records via Tauri IPC or web API.
 * - `saveMessage`: optimistically updates state, then persists to file.
 * - `getMessagesForAgent`: filtered view by agent.
 */
export function useCrystalMessages() {
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const [records, setRecords] = useState<CrystalMessageRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  // -------------------------------------------------------------------------
  // Initial load from persisted file
  // -------------------------------------------------------------------------
  useEffect(() => {
    async function load() {
      try {
        let items: CrystalMessageRecord[];
        if (isTauri) {
          items = await invoke<CrystalMessageRecord[]>("read_crystal_messages");
        } else {
          const res = await fetch("/api/crystal-messages");
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as { records?: CrystalMessageRecord[] };
          items = data.records ?? [];
        }
        setRecords(items);
      } catch {
        // Silently treat errors as empty — app still works without history
        setRecords([]);
      } finally {
        setLoaded(true);
      }
    }
    load();
  }, [isTauri]);

  // -------------------------------------------------------------------------
  // Save a new message (optimistic + persist)
  // -------------------------------------------------------------------------
  const saveMessage = useCallback(
    async (record: CrystalMessageRecord) => {
      // Optimistic update so the UI shows the message immediately
      setRecords((prev) => [...prev, record]);

      try {
        if (isTauri) {
          await invoke("save_crystal_message", { record });
        } else {
          const res = await fetch("/api/crystal-messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(record),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }
      } catch {
        // Rollback optimistic update on failure so state stays consistent
        setRecords((prev) => prev.filter((r) => r.id !== record.id));
      }
    },
    [isTauri]
  );

  // -------------------------------------------------------------------------
  // Filtered view per agent
  // -------------------------------------------------------------------------
  const getMessagesForAgent = useCallback(
    (agent: AgentId): CrystalMessageRecord[] =>
      records.filter((r) => r.agent === agent),
    [records]
  );

  return { records, loaded, saveMessage, getMessagesForAgent };
}

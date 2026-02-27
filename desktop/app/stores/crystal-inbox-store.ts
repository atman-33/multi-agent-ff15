import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InboxMessage {
  content: string;
  from: string;
  id: string;
  msg_type: string;
  read: boolean;
  timestamp: string;
}

const POLL_INTERVAL_MS = 5_000;

interface CrystalInboxState {
  /** All messages (newest first after fetch) */
  messages: InboxMessage[];
  /** Number of unread messages — derived on every mutation for instant reactivity */
  unreadCount: number;
  /** Loading indicator */
  loading: boolean;
  /** Last error message, if any */
  error: string | null;
  /** Whether a "mark all" operation is in progress */
  markingAll: boolean;
  /** Whether background polling is active */
  _pollingTimer: ReturnType<typeof setInterval> | null;

  // Actions
  fetchData: () => Promise<void>;
  markAsRead: (messageId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  /** Start background polling for new messages (call once from root layout) */
  startPolling: () => void;
  /** Stop background polling (cleanup) */
  stopPolling: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function countUnread(messages: InboxMessage[]): number {
  return messages.filter((m) => !m.read).length;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useCrystalInboxStore = create<CrystalInboxState>((set, get) => ({
  messages: [],
  unreadCount: 0,
  loading: false,
  error: null,
  markingAll: false,
  _pollingTimer: null,

  fetchData: async () => {
    set({ loading: true });
    try {
      let messages: InboxMessage[];
      let unreadCount: number;

      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/core");
        const [count, msgs] = await Promise.all([
          invoke<number>("peek_inbox", { agent: "crystal" }),
          invoke<InboxMessage[]>("list_inbox_messages", { agent: "crystal" }),
        ]);
        unreadCount = count;
        messages = msgs;
      } else {
        const res = await fetch("/api/inbox/crystal");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        unreadCount = data.count;
        messages = data.messages;
      }

      set({ messages, unreadCount, error: null });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  markAsRead: async (messageId: string) => {
    const { messages } = get();

    // Optimistic update — instant UI reaction
    const updated = messages.map((m) =>
      m.id === messageId ? { ...m, read: true } : m
    );
    set({ messages: updated, unreadCount: countUnread(updated) });

    try {
      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("mark_inbox_read", { agent: "crystal", messageId });
      } else {
        await fetch("/api/inbox/crystal", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark_read", id: messageId }),
        });
      }
    } catch {
      // Revert on failure
      get().fetchData();
    }
  },

  markAllAsRead: async () => {
    const { messages } = get();
    if (countUnread(messages) === 0) return;

    // Optimistic update — instant UI reaction
    const updated = messages.map((m) => ({ ...m, read: true }));
    set({ messages: updated, unreadCount: 0, markingAll: true });

    try {
      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("mark_all_inbox_read", { agent: "crystal" });
      } else {
        await fetch("/api/inbox/crystal", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark_all_read" }),
        });
      }
    } catch {
      get().fetchData();
    } finally {
      set({ markingAll: false });
    }
  },

  startPolling: () => {
    const { _pollingTimer } = get();
    if (_pollingTimer) return; // already running

    // Initial fetch
    get().fetchData();

    const timer = setInterval(() => {
      get().fetchData();
    }, POLL_INTERVAL_MS);
    set({ _pollingTimer: timer });
  },

  stopPolling: () => {
    const { _pollingTimer } = get();
    if (_pollingTimer) {
      clearInterval(_pollingTimer);
      set({ _pollingTimer: null });
    }
  },
}));

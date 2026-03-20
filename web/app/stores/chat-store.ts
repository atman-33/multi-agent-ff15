import { create } from "zustand";

type ModelSelection = {
  providerID: string;
  modelID: string;
};

type SessionDraftSlashMention = {
  description?: string;
  insertText: string;
  label: string;
  type: "command" | "skill";
  value: string;
};

type SessionDraft = {
  value: string;
  fileMentions: string[];
  slashMentions: SessionDraftSlashMention[];
};

type ChatStore = {
  currentSessionId: string | null;
  setCurrentSessionId: (id: string) => void;
  selectedModel: ModelSelection | null;
  setSelectedModel: (model: ModelSelection) => void;
  selectedAgent: string | null;
  setSelectedAgent: (agent: string | null) => void;
  sessionDrafts: Record<string, SessionDraft>;
  setSessionDraft: (sessionId: string, draft: SessionDraft) => void;
  clearSessionDraft: (sessionId: string) => void;
  sessionStates: Record<string, "idle" | "busy" | "retry">;
  setSessionState: (sessionId: string, state: "idle" | "busy" | "retry") => void;
  streamingMessageId: string | null;
  setStreamingMessageId: (id: string | null) => void;
  streamingContent: string;
  appendStreamingContent: (text: string) => void;
  clearStreamingContent: () => void;
};

const MODEL_STORAGE_KEY = "ff15.selectedModel";
const AGENT_STORAGE_KEY = "ff15.selectedAgent";
const SESSION_DRAFTS_STORAGE_KEY = "ff15.sessionDrafts";

const isSessionDraftSlashMention = (value: unknown): value is SessionDraftSlashMention => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const mention = value as Record<string, unknown>;

  return (
    typeof mention.insertText === "string" &&
    typeof mention.label === "string" &&
    (mention.type === "command" || mention.type === "skill") &&
    typeof mention.value === "string" &&
    (mention.description === undefined || typeof mention.description === "string")
  );
};

const getInitialModel = (): ModelSelection | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(MODEL_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ModelSelection;
    if (parsed?.providerID && parsed?.modelID) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
};

const getInitialAgent = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(AGENT_STORAGE_KEY);
  if (!raw) return null;
  return raw;
};

const getInitialSessionDrafts = (): Record<string, SessionDraft> => {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = window.localStorage.getItem(SESSION_DRAFTS_STORAGE_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const drafts: Record<string, SessionDraft> = {};

    for (const [sessionId, draft] of Object.entries(parsed)) {
      if (!draft || typeof draft !== "object") {
        continue;
      }

      const sessionDraft = draft as Record<string, unknown>;

      const value = typeof sessionDraft.value === "string" ? sessionDraft.value : "";
      const fileMentions = Array.isArray(sessionDraft.fileMentions)
        ? sessionDraft.fileMentions.filter((item): item is string => typeof item === "string")
        : [];
      const slashMentions = Array.isArray(sessionDraft.slashMentions)
        ? sessionDraft.slashMentions.filter(isSessionDraftSlashMention)
        : [];

      if (!value && fileMentions.length === 0 && slashMentions.length === 0) {
        continue;
      }

      drafts[sessionId] = {
        value,
        fileMentions,
        slashMentions,
      };
    }

    return drafts;
  } catch {
    return {};
  }
};

const persistSessionDrafts = (drafts: Record<string, SessionDraft>): void => {
  if (typeof window === "undefined") {
    return;
  }

  if (Object.keys(drafts).length === 0) {
    window.localStorage.removeItem(SESSION_DRAFTS_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(SESSION_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
};

export const useChatStore = create<ChatStore>((set) => ({
  currentSessionId: null,
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
  selectedModel: getInitialModel(),
  setSelectedModel: (model) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(model));
    }
    set({ selectedModel: model });
  },
  selectedAgent: getInitialAgent(),
  setSelectedAgent: (agent) => {
    if (typeof window !== "undefined") {
      if (agent) {
        window.localStorage.setItem(AGENT_STORAGE_KEY, agent);
      } else {
        window.localStorage.removeItem(AGENT_STORAGE_KEY);
      }
    }
    set({ selectedAgent: agent });
  },
  sessionDrafts: getInitialSessionDrafts(),
  setSessionDraft: (sessionId, draft) =>
    set((current) => {
      const sessionDrafts = { ...current.sessionDrafts, [sessionId]: draft };
      persistSessionDrafts(sessionDrafts);
      return { sessionDrafts };
    }),
  clearSessionDraft: (sessionId) =>
    set((current) => {
      if (!(sessionId in current.sessionDrafts)) {
        return current;
      }

      const sessionDrafts = { ...current.sessionDrafts };
      delete sessionDrafts[sessionId];
      persistSessionDrafts(sessionDrafts);
      return { sessionDrafts };
    }),
  sessionStates: {},
  setSessionState: (sessionId, state) =>
    set((current) => ({
      sessionStates:
        current.sessionStates[sessionId] === state
          ? current.sessionStates
          : { ...current.sessionStates, [sessionId]: state },
    })),
  streamingMessageId: null,
  setStreamingMessageId: (id) => set({ streamingMessageId: id }),
  streamingContent: "",
  appendStreamingContent: (text) =>
    set((state) => ({ streamingContent: state.streamingContent + text })),
  clearStreamingContent: () => set({ streamingContent: "" }),
}));

export type { ChatStore, ModelSelection, SessionDraft, SessionDraftSlashMention };

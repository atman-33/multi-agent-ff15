import { create } from "zustand";

type ModelSelection = {
  providerID: string;
  modelID: string;
};

type ChatStore = {
  currentSessionId: string | null;
  setCurrentSessionId: (id: string) => void;
  selectedModel: ModelSelection | null;
  setSelectedModel: (model: ModelSelection) => void;
  selectedAgent: string | null;
  setSelectedAgent: (agent: string | null) => void;
  streamingMessageId: string | null;
  setStreamingMessageId: (id: string | null) => void;
  streamingContent: string;
  appendStreamingContent: (text: string) => void;
  clearStreamingContent: () => void;
};

const MODEL_STORAGE_KEY = "ff15.selectedModel";
const AGENT_STORAGE_KEY = "ff15.selectedAgent";

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
  streamingMessageId: null,
  setStreamingMessageId: (id) => set({ streamingMessageId: id }),
  streamingContent: "",
  appendStreamingContent: (text) =>
    set((state) => ({ streamingContent: state.streamingContent + text })),
  clearStreamingContent: () => set({ streamingContent: "" }),
}));

export type { ChatStore, ModelSelection };

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
  streamingMessageId: string | null;
  setStreamingMessageId: (id: string | null) => void;
  streamingContent: string;
  appendStreamingContent: (text: string) => void;
  clearStreamingContent: () => void;
};

const MODEL_STORAGE_KEY = "ff15.selectedModel";

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
  streamingMessageId: null,
  setStreamingMessageId: (id) => set({ streamingMessageId: id }),
  streamingContent: "",
  appendStreamingContent: (text) => set((state) => ({ streamingContent: state.streamingContent + text })),
  clearStreamingContent: () => set({ streamingContent: "" }),
}));

export type { ChatStore, ModelSelection };

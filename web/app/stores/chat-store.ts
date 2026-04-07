import { create } from "zustand";
import {
  createDefaultWorkingPartyState,
  type WorkingPartyMemberId,
  type WorkingPartyState,
} from "@/lib/noctis-working-party";
import type { SessionStatus } from "@/lib/session-status";
import type { ModelSelection } from "@/lib/types/mission";

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
  agentModels: Record<string, ModelSelection | null>;
  setAgentModel: (agentId: string, model: ModelSelection | null) => void;
  setAgentModels: (models: Record<string, ModelSelection | null>) => void;
  workingParty: WorkingPartyState;
  setWorkingPartyMember: (agentId: WorkingPartyMemberId, joined: boolean) => void;
  sessionDrafts: Record<string, SessionDraft>;
  setSessionDraft: (sessionId: string, draft: SessionDraft) => void;
  clearSessionDraft: (sessionId: string) => void;
  pendingMissionSessions: Record<string, string>;
  setPendingMissionSession: (missionId: string, sessionId: string) => void;
  clearPendingMissionSession: (missionId: string) => void;
  serverSessionStates: Record<string, SessionStatus>;
  optimisticSessionStates: Record<string, SessionStatus>;
  sessionStates: Record<string, SessionStatus>;
  setServerSessionState: (sessionId: string, state: SessionStatus) => void;
  replaceServerSessionStates: (sessionStates: Record<string, SessionStatus>) => void;
  setOptimisticSessionState: (sessionId: string, state: SessionStatus, ttlMs?: number) => void;
  clearOptimisticSessionState: (sessionId: string) => void;
  streamingMessageId: string | null;
  setStreamingMessageId: (id: string | null) => void;
  streamingContent: string;
  setStreamingContent: (text: string) => void;
  appendStreamingContent: (text: string) => void;
  clearStreamingContent: () => void;
};

const MODEL_STORAGE_KEY = "ff15.selectedModel";
const AGENT_STORAGE_KEY = "ff15.selectedAgent";
const AGENT_MODELS_STORAGE_KEY = "ff15.agentModels";
const WORKING_PARTY_STORAGE_KEY = "ff15.workingParty";
const SESSION_DRAFTS_STORAGE_KEY = "ff15.sessionDrafts";
const OPTIMISTIC_SESSION_TTL_MS = 15000;

const normalizeAgentModelKey = (agentId: string): string => {
  return agentId === "gladio" ? "gladiolus" : agentId;
};

const sanitizeAgentModels = (
  agentModels: Record<string, ModelSelection | null>
): Record<string, ModelSelection | null> => {
  const normalized: Record<string, ModelSelection | null> = {};

  for (const [agentId, model] of Object.entries(agentModels)) {
    normalized[normalizeAgentModelKey(agentId)] = model;
  }

  return normalized;
};

const persistAgentModels = (agentModels: Record<string, ModelSelection | null>): void => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    AGENT_MODELS_STORAGE_KEY,
    JSON.stringify(sanitizeAgentModels(agentModels))
  );
};

const getInitialWorkingParty = (): WorkingPartyState => {
  const defaults = createDefaultWorkingPartyState();

  if (typeof window === "undefined") {
    return defaults;
  }

  const raw = window.localStorage.getItem(WORKING_PARTY_STORAGE_KEY);
  if (!raw) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      ignis: typeof parsed.ignis === "boolean" ? parsed.ignis : defaults.ignis,
      gladiolus: typeof parsed.gladiolus === "boolean" ? parsed.gladiolus : defaults.gladiolus,
      prompto: typeof parsed.prompto === "boolean" ? parsed.prompto : defaults.prompto,
    };
  } catch {
    return defaults;
  }
};

const persistWorkingParty = (workingParty: WorkingPartyState): void => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(WORKING_PARTY_STORAGE_KEY, JSON.stringify(workingParty));
};

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

const getInitialAgentModels = (): Record<string, ModelSelection | null> => {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(AGENT_MODELS_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Record<string, ModelSelection | null> = {};
    for (const [agentId, value] of Object.entries(parsed)) {
      const normalizedAgentId = normalizeAgentModelKey(agentId);
      if (!value || typeof value !== "object") {
        result[normalizedAgentId] = null;
        continue;
      }
      const v = value as Record<string, unknown>;
      if (typeof v.providerID === "string" && typeof v.modelID === "string") {
        result[normalizedAgentId] = {
          providerID: v.providerID,
          modelID: v.modelID,
          ...(typeof v.variant === "string" ? { variant: v.variant } : {}),
        };
      }
    }
    return sanitizeAgentModels(result);
  } catch {
    return {};
  }
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

const normalizeTrackedSessionStates = (
  sessionStates: Record<string, SessionStatus>
): Record<string, SessionStatus> => {
  const next: Record<string, SessionStatus> = {};

  for (const [sessionId, state] of Object.entries(sessionStates)) {
    if (state === "busy" || state === "retry") {
      next[sessionId] = state;
    }
  }

  return next;
};

const mergeSessionStates = (
  serverSessionStates: Record<string, SessionStatus>,
  optimisticSessionStates: Record<string, SessionStatus>
): Record<string, SessionStatus> => {
  return {
    ...normalizeTrackedSessionStates(serverSessionStates),
    ...normalizeTrackedSessionStates(optimisticSessionStates),
  };
};

const optimisticSessionTimers = new Map<string, number>();

const clearOptimisticSessionTimer = (sessionId: string): void => {
  const timer = optimisticSessionTimers.get(sessionId);
  if (!timer) {
    return;
  }

  clearTimeout(timer);
  optimisticSessionTimers.delete(sessionId);
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
  agentModels: getInitialAgentModels(),
  setAgentModel: (agentId, model) => {
    set((current) => {
      const next = sanitizeAgentModels({
        ...current.agentModels,
        [normalizeAgentModelKey(agentId)]: model,
      });
      persistAgentModels(next);
      return { agentModels: next };
    });
  },
  setAgentModels: (models) => {
    set((current) => {
      const next = sanitizeAgentModels({ ...current.agentModels, ...models });
      persistAgentModels(next);
      return { agentModels: next };
    });
  },
  workingParty: getInitialWorkingParty(),
  setWorkingPartyMember: (agentId, joined) =>
    set((current) => {
      if (current.workingParty[agentId] === joined) {
        return current;
      }

      const workingParty = {
        ...current.workingParty,
        [agentId]: joined,
      };
      persistWorkingParty(workingParty);
      return { workingParty };
    }),
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
  pendingMissionSessions: {},
  setPendingMissionSession: (missionId, sessionId) =>
    set((current) => {
      if (current.pendingMissionSessions[missionId] === sessionId) {
        return current;
      }

      return {
        pendingMissionSessions: {
          ...current.pendingMissionSessions,
          [missionId]: sessionId,
        },
      };
    }),
  clearPendingMissionSession: (missionId) =>
    set((current) => {
      if (!(missionId in current.pendingMissionSessions)) {
        return current;
      }

      const pendingMissionSessions = { ...current.pendingMissionSessions };
      delete pendingMissionSessions[missionId];
      return { pendingMissionSessions };
    }),
  serverSessionStates: {},
  optimisticSessionStates: {},
  sessionStates: {},
  setServerSessionState: (sessionId, state) =>
    set((current) => {
      const nextServerSessionStates = { ...current.serverSessionStates };

      if (state === "idle") {
        if (!(sessionId in nextServerSessionStates)) {
          clearOptimisticSessionTimer(sessionId);

          if (!(sessionId in current.optimisticSessionStates)) {
            return current;
          }

          const optimisticSessionStates = { ...current.optimisticSessionStates };
          delete optimisticSessionStates[sessionId];
          return {
            optimisticSessionStates,
            sessionStates: mergeSessionStates(nextServerSessionStates, optimisticSessionStates),
          };
        }

        delete nextServerSessionStates[sessionId];
        clearOptimisticSessionTimer(sessionId);

        if (!(sessionId in current.optimisticSessionStates)) {
          return {
            serverSessionStates: nextServerSessionStates,
            sessionStates: mergeSessionStates(
              nextServerSessionStates,
              current.optimisticSessionStates
            ),
          };
        }

        const optimisticSessionStates = { ...current.optimisticSessionStates };
        delete optimisticSessionStates[sessionId];
        return {
          serverSessionStates: nextServerSessionStates,
          optimisticSessionStates,
          sessionStates: mergeSessionStates(nextServerSessionStates, optimisticSessionStates),
        };
      }

      if (
        current.serverSessionStates[sessionId] === state &&
        !(sessionId in current.optimisticSessionStates)
      ) {
        return current;
      }

      nextServerSessionStates[sessionId] = state;

      if (!(sessionId in current.optimisticSessionStates)) {
        return {
          serverSessionStates: nextServerSessionStates,
          sessionStates: mergeSessionStates(
            nextServerSessionStates,
            current.optimisticSessionStates
          ),
        };
      }

      clearOptimisticSessionTimer(sessionId);
      const optimisticSessionStates = { ...current.optimisticSessionStates };
      delete optimisticSessionStates[sessionId];
      return {
        serverSessionStates: nextServerSessionStates,
        optimisticSessionStates,
        sessionStates: mergeSessionStates(nextServerSessionStates, optimisticSessionStates),
      };
    }),
  replaceServerSessionStates: (sessionStates) =>
    set((current) => {
      const nextServerSessionStates = normalizeTrackedSessionStates(sessionStates);

      let optimisticSessionStates = current.optimisticSessionStates;
      let optimisticChanged = false;
      for (const sessionId of Object.keys(nextServerSessionStates)) {
        if (!(sessionId in optimisticSessionStates)) {
          continue;
        }

        if (!optimisticChanged) {
          optimisticSessionStates = { ...optimisticSessionStates };
          optimisticChanged = true;
        }

        delete optimisticSessionStates[sessionId];
        clearOptimisticSessionTimer(sessionId);
      }

      const nextSessionStates = mergeSessionStates(
        nextServerSessionStates,
        optimisticSessionStates
      );
      const currentEntries = Object.entries(current.sessionStates);
      const nextEntries = Object.entries(nextSessionStates);

      const sameEffective =
        currentEntries.length === nextEntries.length &&
        currentEntries.every(([sessionId, state]) => nextSessionStates[sessionId] === state);

      const currentServerEntries = Object.entries(current.serverSessionStates);
      const nextServerEntries = Object.entries(nextServerSessionStates);
      const sameServer =
        currentServerEntries.length === nextServerEntries.length &&
        currentServerEntries.every(
          ([sessionId, state]) => nextServerSessionStates[sessionId] === state
        );

      if (sameEffective && sameServer && !optimisticChanged) {
        return current;
      }

      return {
        serverSessionStates: nextServerSessionStates,
        optimisticSessionStates,
        sessionStates: nextSessionStates,
      };
    }),
  setOptimisticSessionState: (sessionId, state, ttlMs = OPTIMISTIC_SESSION_TTL_MS) =>
    set((current) => {
      if (state === "idle") {
        clearOptimisticSessionTimer(sessionId);
        if (!(sessionId in current.optimisticSessionStates)) {
          return current;
        }

        const optimisticSessionStates = { ...current.optimisticSessionStates };
        delete optimisticSessionStates[sessionId];
        return {
          optimisticSessionStates,
          sessionStates: mergeSessionStates(current.serverSessionStates, optimisticSessionStates),
        };
      }

      clearOptimisticSessionTimer(sessionId);
      const optimisticSessionStates = { ...current.optimisticSessionStates, [sessionId]: state };

      if (typeof window !== "undefined") {
        const timer = window.setTimeout(() => {
          useChatStore.getState().clearOptimisticSessionState(sessionId);
        }, ttlMs);
        optimisticSessionTimers.set(sessionId, timer);
      }

      return {
        optimisticSessionStates,
        sessionStates: mergeSessionStates(current.serverSessionStates, optimisticSessionStates),
      };
    }),
  clearOptimisticSessionState: (sessionId) =>
    set((current) => {
      clearOptimisticSessionTimer(sessionId);
      if (!(sessionId in current.optimisticSessionStates)) {
        return current;
      }

      const optimisticSessionStates = { ...current.optimisticSessionStates };
      delete optimisticSessionStates[sessionId];
      return {
        optimisticSessionStates,
        sessionStates: mergeSessionStates(current.serverSessionStates, optimisticSessionStates),
      };
    }),
  streamingMessageId: null,
  setStreamingMessageId: (id) => set({ streamingMessageId: id }),
  streamingContent: "",
  setStreamingContent: (text) => set({ streamingContent: text }),
  appendStreamingContent: (text) =>
    set((state) => ({ streamingContent: state.streamingContent + text })),
  clearStreamingContent: () => set({ streamingContent: "" }),
}));

export type { ChatStore, ModelSelection, SessionDraft, SessionDraftSlashMention };

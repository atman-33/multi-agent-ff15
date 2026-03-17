import type { AgentId } from "@/hooks/use-agent-chat-log";

export type DraftTargetAgentId = AgentId;

export const ACTIVE_CHAT_TARGET_STORAGE_KEY = "chat_active_target_agent";
export const CHAT_DRAFT_UPDATED_EVENT = "chat-draft-updated";

function isDraftTargetAgent(value: string): value is DraftTargetAgentId {
  return (
    value === "noctis" ||
    value === "lunafreya" ||
    value === "ignis" ||
    value === "gladiolus" ||
    value === "prompto" ||
    value === "iris"
  );
}

export function getChatDraftStorageKey(agent: DraftTargetAgentId) {
  return `chat_draft_${agent}`;
}

export function getStoredActiveChatTarget(): DraftTargetAgentId | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = localStorage.getItem(ACTIVE_CHAT_TARGET_STORAGE_KEY);
  return raw && isDraftTargetAgent(raw) ? raw : null;
}

export function setStoredActiveChatTarget(agent: DraftTargetAgentId) {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(ACTIVE_CHAT_TARGET_STORAGE_KEY, agent);
}

export function readChatDraft(agent: DraftTargetAgentId) {
  if (typeof window === "undefined") {
    return "";
  }

  return localStorage.getItem(getChatDraftStorageKey(agent)) ?? "";
}

export function writeChatDraft(agent: DraftTargetAgentId, content: string) {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(getChatDraftStorageKey(agent), content);
  window.dispatchEvent(
    new CustomEvent(CHAT_DRAFT_UPDATED_EVENT, { detail: { agent } })
  );
}

export function clearChatDraft(agent: DraftTargetAgentId) {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(getChatDraftStorageKey(agent));
  window.dispatchEvent(
    new CustomEvent(CHAT_DRAFT_UPDATED_EVENT, { detail: { agent } })
  );
}

export function appendToChatDraft(agent: DraftTargetAgentId, text: string) {
  const previous = readChatDraft(agent).trimEnd();
  const next = previous ? `${previous}\n${text}` : text;
  writeChatDraft(agent, next);
}

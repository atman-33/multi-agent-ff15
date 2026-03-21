import { BANTER_CATALOG } from "./catalog";
import type {
  BanterAgentId,
  BanterCue,
  BanterSelectionOptions,
  BanterTemplate,
  RecentBanterEntry,
} from "./types";

const AGENT_DISPLAY: Record<BanterAgentId, { name: string; avatar: string; memberId: string }> = {
  noctis: { name: "Noctis", avatar: "/images/noctis.png", memberId: "noctis" },
  ignis: { name: "Ignis", avatar: "/images/ignis.png", memberId: "ignis" },
  gladiolus: { name: "Gladio", avatar: "/images/gladiolus.png", memberId: "gladio" },
  prompto: { name: "Prompto", avatar: "/images/prompto.png", memberId: "prompto" },
};

export function normalizeBanterAgentId(agentId: string): BanterAgentId | null {
  if (agentId === "gladio") {
    return "gladiolus";
  }

  if (agentId === "noctis" || agentId === "ignis" || agentId === "gladiolus" || agentId === "prompto") {
    return agentId;
  }

  return null;
}

export function toPartyMemberId(agentId: string): string {
  const normalized = normalizeBanterAgentId(agentId);
  return normalized ? AGENT_DISPLAY[normalized].memberId : agentId;
}

function pickMessage(
  agentId: BanterAgentId,
  messages: string[],
  recentEntries: RecentBanterEntry[]
): string | null {
  if (messages.length === 0) {
    return null;
  }

  const recent = recentEntries.slice(-5).map((entry) => ({
    agentId: normalizeBanterAgentId(entry.speakerId),
    message: entry.message,
  }));
  const lastEntry = recent.at(-1);

  const withoutRecentDuplicates = messages.filter(
    (message) => !recent.some((entry) => entry.agentId === agentId && entry.message === message)
  );
  const firstPool = withoutRecentDuplicates.length > 0 ? withoutRecentDuplicates : messages;

  const withoutImmediateRepeat =
    lastEntry?.agentId === agentId
      ? firstPool.filter((message) => message !== lastEntry.message)
      : firstPool;
  const finalPool = withoutImmediateRepeat.length > 0 ? withoutImmediateRepeat : firstPool;

  return finalPool[Math.floor(Math.random() * finalPool.length)] ?? finalPool[0] ?? null;
}

export function createBanterTemplate(
  agentId: string,
  cue: BanterCue,
  options: BanterSelectionOptions
): BanterTemplate | null {
  const normalized = normalizeBanterAgentId(agentId);
  if (!normalized) {
    return null;
  }

  const languageCatalog = BANTER_CATALOG[options.language][normalized];
  const fallbackCatalog = BANTER_CATALOG.other[normalized];
  const messages = languageCatalog[cue] ?? fallbackCatalog[cue] ?? [];
  const message = pickMessage(normalized, messages, options.recentEntries ?? []);
  if (!message) {
    return null;
  }

  const display = AGENT_DISPLAY[normalized];
  return {
    speakerId: normalized,
    speakerName: display.name,
    speakerAvatar: display.avatar,
    message,
  };
}

export function createLiteralBanterTemplate(
  agentId: string,
  message: string
): BanterTemplate | null {
  const normalized = normalizeBanterAgentId(agentId);
  const trimmed = message.trim();
  if (!normalized || trimmed.length === 0) {
    return null;
  }

  const display = AGENT_DISPLAY[normalized];
  return {
    speakerId: normalized,
    speakerName: display.name,
    speakerAvatar: display.avatar,
    message: trimmed,
  };
}
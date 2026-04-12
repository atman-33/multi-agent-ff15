import { normalizeBanterAgentId } from "@/lib/banter/runtime";

export type ThemedAgentId = "noctis" | "lunafreya" | "ignis" | "gladiolus" | "prompto";

export interface AgentTheme {
  accent: string;
  accentStrong: string;
  text: string;
  surface: string;
  surfaceStrong: string;
  portraitBg: string;
  ring: string;
  glow: string;
  glowSoft: string;
}

const AGENT_THEMES: Record<ThemedAgentId, AgentTheme> = {
  noctis: {
    accent: "#6b79b7",
    accentStrong: "#8f9ce0",
    text: "#cbd5ff",
    surface: "rgba(107, 121, 183, 0.12)",
    surfaceStrong: "rgba(107, 121, 183, 0.18)",
    portraitBg: "rgba(16, 21, 38, 0.96)",
    ring: "rgba(143, 156, 224, 0.6)",
    glow: "rgba(107, 121, 183, 0.28)",
    glowSoft: "rgba(107, 121, 183, 0.18)",
  },
  lunafreya: {
    accent: "#7db7b0",
    accentStrong: "#a5e4db",
    text: "#e7fff9",
    surface: "rgba(125, 183, 176, 0.12)",
    surfaceStrong: "rgba(125, 183, 176, 0.2)",
    portraitBg: "rgba(10, 23, 22, 0.96)",
    ring: "rgba(165, 228, 219, 0.62)",
    glow: "rgba(125, 183, 176, 0.3)",
    glowSoft: "rgba(125, 183, 176, 0.18)",
  },
  ignis: {
    accent: "#2f6b52",
    accentStrong: "#4b9272",
    text: "#cbe9d8",
    surface: "rgba(47, 107, 82, 0.12)",
    surfaceStrong: "rgba(47, 107, 82, 0.18)",
    portraitBg: "rgba(13, 26, 21, 0.96)",
    ring: "rgba(75, 146, 114, 0.62)",
    glow: "rgba(47, 107, 82, 0.28)",
    glowSoft: "rgba(47, 107, 82, 0.18)",
  },
  gladiolus: {
    accent: "#7b2430",
    accentStrong: "#aa3a49",
    text: "#d47b86",
    surface: "rgba(123, 36, 48, 0.12)",
    surfaceStrong: "rgba(123, 36, 48, 0.18)",
    portraitBg: "rgba(32, 12, 15, 0.96)",
    ring: "rgba(170, 58, 73, 0.62)",
    glow: "rgba(123, 36, 48, 0.28)",
    glowSoft: "rgba(123, 36, 48, 0.18)",
  },
  prompto: {
    accent: "#d7b24b",
    accentStrong: "#f0cf73",
    text: "#fff0b1",
    surface: "rgba(215, 178, 75, 0.12)",
    surfaceStrong: "rgba(215, 178, 75, 0.18)",
    portraitBg: "rgba(34, 28, 14, 0.96)",
    ring: "rgba(240, 207, 115, 0.62)",
    glow: "rgba(215, 178, 75, 0.3)",
    glowSoft: "rgba(215, 178, 75, 0.18)",
  },
};

export function getAgentTheme(agentId: string | null | undefined): AgentTheme | null {
  if (!agentId) {
    return null;
  }

  const normalizedAgentId = agentId.trim().toLowerCase();
  if (normalizedAgentId === "lunafreya") {
    return AGENT_THEMES.lunafreya;
  }

  const normalized = normalizeBanterAgentId(normalizedAgentId);
  return normalized ? AGENT_THEMES[normalized] : null;
}

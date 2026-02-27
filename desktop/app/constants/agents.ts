/**
 * Centralized agent definitions to prevent hardcoding across the application.
 */

export const MAIN_AGENTS = ["noctis", "lunafreya"] as const;
export type MainAgentId = (typeof MAIN_AGENTS)[number];

export const COMRADE_AGENTS = [
  "ignis",
  "gladiolus",
  "prompto",
  "iris",
] as const;
export type ComradeId = (typeof COMRADE_AGENTS)[number];

/** All agents that support model switching. */
export const ALL_MODEL_SWITCH_AGENTS = [
  ...MAIN_AGENTS,
  ...COMRADE_AGENTS,
] as const;
export type ModelSwitchAgent = (typeof ALL_MODEL_SWITCH_AGENTS)[number];

/** Tmux pane index mapping (0-indexed). */
export const AGENT_PANE_INDEX: Record<ModelSwitchAgent, number> = {
  noctis: 0,
  lunafreya: 1,
  ignis: 2,
  gladiolus: 3,
  prompto: 4,
  iris: 5,
};

export const ALLOWED_AGENTS = ALL_MODEL_SWITCH_AGENTS;

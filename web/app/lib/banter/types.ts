import type { AppLanguage } from "@/lib/app-language.server";

export type BanterAgentId = "noctis" | "ignis" | "gladiolus" | "prompto";

export type BanterCue =
  | "session-start"
  | "task-assigned"
  | "task-progress-early"
  | "task-progress-late"
  | "task-completed"
  | "task-failed"
  | "task-retrying"
  | "runtime-recovered";

export interface BanterTemplate {
  speakerId: string;
  speakerName: string;
  speakerAvatar: string;
  message: string;
}

export interface RecentBanterEntry {
  speakerId: string;
  message: string;
}

export interface BanterSelectionOptions {
  language: AppLanguage;
  recentEntries?: RecentBanterEntry[];
}
import type { AppLanguage } from "@/lib/app-language.server";

export type BanterAgentId = "noctis" | "ignis" | "gladiolus" | "prompto";

export type BanterCue =
  | "session-start"
  | "task-delegated"
  | "task-assigned"
  | "message-received"
  | "task-progress-early"
  | "task-progress-late"
  | "report-running"
  | "report-blocked"
  | "report-completed"
  | "report-failed"
  | "report-acknowledged"
  | "session-settled"
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
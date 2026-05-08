import type {
  MessageDetailState,
  MessageErrorInfo,
  MessagePart,
} from "@/lib/opencode-session-types";
import type { AgentContextUsage, ActivityActorId, MissionActivityKind } from "@/lib/types/mission";

export type AgentStatus = "idle" | "working" | "success" | "blocked";

export interface BanterEntry {
  id: string;
  speakerId: string;
  speakerName: string;
  speakerAvatar: string;
  message: string;
  timestamp: Date;
}

export interface ChatMessage {
  id: string;
  sender: ActivityActorId;
  actor: ActivityActorId;
  speaker: ActivityActorId;
  kind: MissionActivityKind;
  content: string;
  detailContent?: string;
  detailState?: MessageDetailState;
  errorInfo?: MessageErrorInfo;
  rawText?: string;
  parts?: MessagePart[];
  timestamp: Date;
  source: "session" | "activity";
}

export interface PartyMember {
  contextUsage?: AgentContextUsage | null;
  id: string;
  name: string;
  role: string;
  imageSrc: string;
  status: AgentStatus;
  detail?: string;
  progress?: number;
}
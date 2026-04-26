import type { ModelSelection } from "@/lib/types/mission";
import type { SessionSelectionAdjustment } from "@/lib/session-selection-adjustment";

export type MessageDetailState = "summary" | "full";

export type MessageSummary = {
  content: string;
  detailContent: string;
  rawText: string;
};

export type MessagePart = {
  type: string;
  text?: string;
  tool?: string;
  detailId?: string;
  sourceMessageId?: string;
  state?: {
    status?: string;
    input?: Record<string, unknown>;
    output?: string;
    error?: string;
  };
};

export type MessageErrorInfo = {
  name?: string;
  message?: string;
};

export type MessageInfo = {
  info: {
    id: string;
    role: "user" | "assistant";
    agent?: string;
    model?: ModelSelection;
    parentID?: string;
    error?: MessageErrorInfo;
    selectionAdjustment?: SessionSelectionAdjustment;
    time: {
      created: number;
      completed?: number;
    };
  };
  detailState?: MessageDetailState;
  parts: MessagePart[];
  summary?: MessageSummary;
};
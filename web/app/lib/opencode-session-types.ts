import type { ModelSelection } from "@/lib/types/mission";
import type { SessionSelectionAdjustment } from "@/lib/session-selection-adjustment";

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

export type MessageInfo = {
  info: {
    id: string;
    role: "user" | "assistant";
    agent?: string;
    model?: ModelSelection;
    parentID?: string;
    selectionAdjustment?: SessionSelectionAdjustment;
    time: {
      created: number;
      completed?: number;
    };
  };
  parts: MessagePart[];
};
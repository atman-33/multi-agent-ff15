export type MessagePart = {
  type: string;
  text?: string;
  tool?: string;
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
    time: {
      created: number;
      completed?: number;
    };
  };
  parts: MessagePart[];
};

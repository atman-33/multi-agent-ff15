import { createOpencodeClient } from "@opencode-ai/sdk/client";

const OPENCODE_BASE_URL = "http://127.0.0.1:4097";

export const getOpencodeClient = () => {
  return createOpencodeClient({ baseUrl: OPENCODE_BASE_URL });
};

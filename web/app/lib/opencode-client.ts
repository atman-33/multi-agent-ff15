import { createOpencodeClient } from "@opencode-ai/sdk/client";
import { getOpencodeBaseUrl } from "./opencode-server";

export const getOpencodeClient = () => {
  return createOpencodeClient({ baseUrl: getOpencodeBaseUrl() });
};

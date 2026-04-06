import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { getProjectRoot } from "./get-project-root.server";
import { getOpencodeBaseUrl } from "./opencode-server";

export const getOpencodeClient = () => {
  return createOpencodeClient({
    baseUrl: getOpencodeBaseUrl(),
    directory: getProjectRoot(),
  });
};
